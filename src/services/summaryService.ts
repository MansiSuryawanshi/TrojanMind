/**
 * Hierarchical document summarization + grounded Q&A for StudyBuddy Summary.
 */
import { ANTHROPIC_MODEL, ANTHROPIC_FALLBACK_MODEL } from '../config/aiConfig';
import { parsePagedText } from './pdfService';
import type { StudyDocument } from '../types';
import type {
  SummaryMode,
  DocumentChunk,
  DocumentPage,
  StructuredSummary,
  TopicSummary,
  SummaryProgress,
  ConceptCard,
  Flashcard,
  ChatMessage,
} from '../types/summary';

import { AI_ENDPOINT as CLAUDE_URL, aiFetch } from './aiClient';
const TARGET_CHUNK_CHARS = 5500;
const MAX_RETRIES = 2;

// The API key lives only on the backend; aiFetch adds the user's ID token.
function buildHeaders() {
  return { 'Content-Type': 'application/json' };
}

function messageText(data: { content?: { type?: string; text?: string }[] }): string {
  const text = (data.content ?? [])
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .filter((part) => part.trim().length > 0)
    .join('\n')
    .trim();
  if (!text) throw new Error('Claude returned no answer text. Try again.');
  return text;
}

function extractJson(text: string): string {
  let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, '$1').trim();
  if (cleaned === text.trim()) cleaned = text.trim();
  if (cleaned[0] !== '{' && cleaned[0] !== '[') {
    const m = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) cleaned = m[1];
  }
  return cleaned;
}

/** Close truncated JSON strings/brackets so partial Claude replies can still parse. */
function repairTruncatedJson(raw: string): string {
  let s = raw.trim();
  // Trim trailing incomplete key/value fragments after last complete value
  s = s.replace(/,\s*"[^"]*$/g, '');
  s = s.replace(/,\s*$/g, '');

  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    }
  }

  if (inString) s += '"';
  while (stack.length) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }
  return s;
}

/** Extract complete top-level objects from a truncated JSON array. */
function extractCompleteArrayObjects(raw: string): unknown[] {
  const start = raw.indexOf('[');
  if (start < 0) return [];
  const body = raw.slice(start + 1);
  const objects: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && objStart >= 0) {
        const slice = body.slice(objStart, i + 1);
        try {
          objects.push(JSON.parse(slice));
        } catch {
          try {
            objects.push(JSON.parse(repairTruncatedJson(slice)));
          } catch {
            /* skip broken object */
          }
        }
        objStart = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break;
    }
  }
  return objects;
}

function safeParseJson<T = unknown>(text: string): T {
  const extracted = extractJson(text);
  try {
    return JSON.parse(extracted) as T;
  } catch {
    try {
      return JSON.parse(repairTruncatedJson(extracted)) as T;
    } catch {
      const objs = extractCompleteArrayObjects(extracted);
      if (objs.length > 0) return objs as T;
      throw new Error('Could not parse AI JSON response. Try Refresh again.');
    }
  }
}

function normalizeConceptCards(parsed: unknown): ConceptCard[] {
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { concepts?: unknown }).concepts)
      ? (parsed as { concepts: unknown[] }).concepts
      : [];

  return list
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c, i) => ({
      id: String(c.id || `concept_${i}`),
      name: String(c.name || `Concept ${i + 1}`),
      shortDescription: String(c.shortDescription || ''),
      detailedExplanation: String(c.detailedExplanation || ''),
      sourcePages: Array.isArray(c.sourcePages)
        ? (c.sourcePages as unknown[]).map(Number).filter((n) => !Number.isNaN(n))
        : [],
      relatedConcepts: Array.isArray(c.relatedConcepts)
        ? (c.relatedConcepts as unknown[]).map(String)
        : [],
      definitions: Array.isArray(c.definitions) ? (c.definitions as unknown[]).map(String) : [],
      example: String(c.example || ''),
    }));
}

/** Local fallback when Claude JSON is truncated — build cards from the summary itself. */
function conceptsFromSummaryFallback(summary: StructuredSummary): ConceptCard[] {
  const fromTopics = summary.topics.slice(0, 12).map((t, i) => ({
    id: `topic_${i}`,
    name: t.title,
    shortDescription: (t.explanation || '').slice(0, 160),
    detailedExplanation: t.explanation || '',
    sourcePages: t.sourcePages || [],
    relatedConcepts: t.subtopics || [],
    definitions: t.definitions || [],
    example: t.examples?.[0] || '',
  }));

  if (fromTopics.length > 0) return fromTopics;

  return summary.keyConcepts.slice(0, 12).map((name, i) => ({
    id: `key_${i}`,
    name,
    shortDescription: name,
    detailedExplanation: summary.overview || name,
    sourcePages: [],
    relatedConcepts: [],
    definitions: [],
    example: '',
  }));
}

const CLAUDE_MODELS = [
  ANTHROPIC_MODEL,
  ANTHROPIC_FALLBACK_MODEL,
  'claude-sonnet-5',
  'claude-haiku-5-5',
];

/** Structured JSON calls: turn off up-front thinking so tokens go to the answer. */
function structuredCallExtras(model: string) {
  const isSonnet55 = /sonnet-5-5/i.test(model);
  return {
    // Sonnet 5.5 rejects "disabled"; between_tools turns off up-front thinking.
    thinking: { type: isSonnet55 ? 'between_tools' : 'disabled' },
    output_config: { effort: 'low' },
  };
}

async function callClaude(
  prompt: string,
  maxTokens: number,
  system?: string
): Promise<string> {

  let lastErr = '';

  for (const model of CLAUDE_MODELS) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      ...structuredCallExtras(model),
      ...(system ? { system } : {}),
      messages: [{ role: 'user' as const, content: prompt }],
    };

    let response = await aiFetch(CLAUDE_URL, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });

    // Some models reject thinking/effort combos — retry bare request once.
    if (!response.ok && (response.status === 400 || response.status === 404)) {
      const errText = await response.text();
      lastErr = errText;
      if (/thinking|effort|output_config|not_found|model/i.test(errText)) {
        response = await aiFetch(CLAUDE_URL, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            ...(system ? { system } : {}),
            messages: [{ role: 'user' as const, content: prompt }],
          }),
        });
      } else {
        continue;
      }
    }

    if (response.ok) {
      const data = await response.json();
      return messageText(data);
    }

    lastErr = await response.text();
    // Auth / credit issues — don't keep trying other models
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Claude API auth error ${response.status}. Check ANTHROPIC_API_KEY in server/.env.local.`
      );
    }
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
  }

  throw new Error(
    `Claude API unavailable: ${lastErr.slice(0, 280) || 'unknown error'}`
  );
}

/** Local extractive summary when Claude is unavailable — grounded, no invention. */
function extractiveChunkSummary(
  chunk: DocumentChunk
): Partial<StructuredSummary> & { topics: TopicSummary[] } {
  const plain = chunk.text
    .replace(/\[Page\s+\d+\]/gi, ' ')
    .replace(/---\s*Page\s+\d+\s*---/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = plain
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 280)
    .slice(0, 8);

  const title =
    chunk.headingHint ||
    `Pages ${chunk.startPage}–${chunk.endPage}`;
  const pages = Array.from(
    { length: chunk.endPage - chunk.startPage + 1 },
    (_, i) => chunk.startPage + i
  );

  return {
    topics: [
      {
        title,
        explanation:
          sentences.slice(0, 4).join(' ') ||
          plain.slice(0, 500) ||
          'No extractable text in this chunk.',
        subtopics: [],
        definitions: [],
        formulas: [],
        procedures: [],
        examples: [],
        relationships: [],
        sourcePages: pages,
      },
    ],
    keyConcepts: sentences
      .flatMap((s) => s.split(/[^A-Za-z0-9-]+/))
      .filter((w) => w.length > 5)
      .slice(0, 6),
    definitionsAndFormulas: [],
    takeaways: sentences.slice(0, 3),
    examRevisionNotes: sentences.slice(0, 2),
    conceptRelationships: [],
    topicsToReview: [title],
    sourceReferences: sentences.slice(0, 2).map((claim) => ({
      claim,
      page: chunk.startPage,
    })),
    coverageNotes: [
      'Claude was unavailable for this chunk; showing extractive notes from the PDF text only.',
    ],
  };
}

function detectHeading(text: string): string | undefined {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    if (line.length > 3 && line.length < 80 && !/^---\s*Page/i.test(line)) {
      if (/^[A-Z0-9]/.test(line) || /^\d+(\.\d+)*\s/.test(line)) return line;
    }
  }
  return undefined;
}

/** Divide page-aware document into manageable chunks. */
export function chunkDocument(pages: DocumentPage[]): DocumentChunk[] {
  const usable = pages.filter((p) => !p.isEmpty && p.text.trim().length > 0);
  if (usable.length === 0) return [];

  const chunks: DocumentChunk[] = [];
  let buf = '';
  let startPage = usable[0].page;
  let endPage = usable[0].page;
  let index = 0;

  const flush = () => {
    if (!buf.trim()) return;
    chunks.push({
      id: `chunk_${index}`,
      index,
      text: buf.trim(),
      startPage,
      endPage,
      headingHint: detectHeading(buf),
    });
    index += 1;
    buf = '';
  };

  for (const page of usable) {
    const piece = `\n[Page ${page.page}]\n${page.text}\n`;
    if (buf.length > 0 && buf.length + piece.length > TARGET_CHUNK_CHARS) {
      flush();
      startPage = page.page;
    }
    if (!buf) startPage = page.page;
    buf += piece;
    endPage = page.page;
  }
  flush();
  return chunks;
}

function modeInstructions(mode: SummaryMode): string {
  switch (mode) {
    case 'quick':
      return 'Produce a concise quick summary: short overview and essential takeaways only. Keep topic explanations brief.';
    case 'exam_revision':
      return 'Focus on high-value exam revision: formulas, definitions, procedures, likely exam topics, and practice-worthy areas.';
    case 'explain_simply':
      return 'Explain everything in simple beginner-friendly language. Avoid jargon unless defined.';
    default:
      return 'Produce a DETAILED comprehensive summary with extensive explanations and source page references.';
  }
}

const EMPTY_SUMMARY = (): StructuredSummary => ({
  overview: '',
  topics: [],
  keyConcepts: [],
  definitionsAndFormulas: [],
  takeaways: [],
  examRevisionNotes: [],
  conceptRelationships: [],
  topicsToReview: [],
  sourceReferences: [],
  coverageNotes: [],
  unscannedPages: [],
});

async function summarizeChunk(
  chunk: DocumentChunk,
  mode: SummaryMode,
  fileName: string
): Promise<Partial<StructuredSummary> & { topics: TopicSummary[] }> {
  const prompt = `You are summarizing part of a study document for students.
Document: ${fileName}
Pages covered in this chunk: ${chunk.startPage}-${chunk.endPage}
${chunk.headingHint ? `Likely heading: ${chunk.headingHint}` : ''}
Mode: ${mode}
${modeInstructions(mode)}

RULES:
- Use ONLY information from the chunk text below. Do NOT invent concepts, formulas, or page numbers.
- Include real page numbers from [Page N] markers. NEVER invent page numbers.
- Prefer concrete definitions, procedures, and examples that appear in the text.
- If the chunk is mostly titles/headers, summarize what the section is about without fabricating details.
- Return ONLY valid JSON.

Chunk text:
"""
${chunk.text.slice(0, 12000)}
"""

JSON schema:
{
  "topics": [{
    "title": "string",
    "explanation": "detailed paragraph grounded in the chunk",
    "subtopics": ["string"],
    "definitions": ["term: meaning"],
    "formulas": ["string"],
    "procedures": ["string"],
    "examples": ["string"],
    "relationships": ["string"],
    "sourcePages": [1,2]
  }],
  "keyConcepts": ["string"],
  "definitionsAndFormulas": [{"term":"","definition":"","formula":"","sourcePages":[1]}],
  "takeaways": ["string"],
  "examRevisionNotes": ["string"],
  "conceptRelationships": [{"from":"","to":"","relationship":""}],
  "topicsToReview": ["string"],
  "sourceReferences": [{"claim":"","page":1}],
  "coverageNotes": ["string"]
}`;

  try {
    const text = await callClaude(prompt, 4096, 'Return ONLY valid JSON. No markdown. Never invent facts.');
    const parsed = safeParseJson<Record<string, any>>(text);
    const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
    if (!topics.length && !(parsed.takeaways?.length)) {
      return extractiveChunkSummary(chunk);
    }
    return {
      topics,
      keyConcepts: parsed.keyConcepts ?? [],
      definitionsAndFormulas: parsed.definitionsAndFormulas ?? [],
      takeaways: parsed.takeaways ?? [],
      examRevisionNotes: parsed.examRevisionNotes ?? [],
      conceptRelationships: parsed.conceptRelationships ?? [],
      topicsToReview: parsed.topicsToReview ?? [],
      sourceReferences: parsed.sourceReferences ?? [],
      coverageNotes: parsed.coverageNotes ?? [],
    };
  } catch (err) {
    console.warn(`[Summary] Claude chunk failed, using extractive fallback for ${chunk.id}`, err);
    return extractiveChunkSummary(chunk);
  }
}

function mergePartial(
  parts: Array<Partial<StructuredSummary> & { topics: TopicSummary[] }>,
  unscannedPages: number[]
): StructuredSummary {
  const merged = EMPTY_SUMMARY();
  merged.unscannedPages = unscannedPages;

  const topicMap = new Map<string, TopicSummary>();

  for (const part of parts) {
    for (const t of part.topics ?? []) {
      const key = (t.title || 'Untitled').trim().toLowerCase();
      const existing = topicMap.get(key);
      if (!existing) {
        topicMap.set(key, {
          title: t.title || 'Untitled',
          explanation: t.explanation || '',
          subtopics: t.subtopics || [],
          definitions: t.definitions || [],
          formulas: t.formulas || [],
          procedures: t.procedures || [],
          examples: t.examples || [],
          relationships: t.relationships || [],
          sourcePages: [...(t.sourcePages || [])],
        });
      } else {
        existing.explanation = [existing.explanation, t.explanation].filter(Boolean).join('\n\n');
        existing.subtopics = [...new Set([...existing.subtopics, ...(t.subtopics || [])])];
        existing.definitions = [...new Set([...existing.definitions, ...(t.definitions || [])])];
        existing.formulas = [...new Set([...existing.formulas, ...(t.formulas || [])])];
        existing.procedures = [...new Set([...existing.procedures, ...(t.procedures || [])])];
        existing.examples = [...new Set([...existing.examples, ...(t.examples || [])])];
        existing.relationships = [...new Set([...existing.relationships, ...(t.relationships || [])])];
        existing.sourcePages = [...new Set([...existing.sourcePages, ...(t.sourcePages || [])])].sort((a, b) => a - b);
      }
    }
    merged.keyConcepts.push(...(part.keyConcepts || []));
    merged.definitionsAndFormulas.push(...(part.definitionsAndFormulas || []));
    merged.takeaways.push(...(part.takeaways || []));
    merged.examRevisionNotes.push(...(part.examRevisionNotes || []));
    merged.conceptRelationships.push(...(part.conceptRelationships || []));
    merged.topicsToReview.push(...(part.topicsToReview || []));
    merged.sourceReferences.push(...(part.sourceReferences || []));
    merged.coverageNotes.push(...(part.coverageNotes || []));
  }

  merged.topics = [...topicMap.values()];
  merged.keyConcepts = [...new Set(merged.keyConcepts)];
  merged.takeaways = [...new Set(merged.takeaways)];
  merged.examRevisionNotes = [...new Set(merged.examRevisionNotes)];
  merged.topicsToReview = [...new Set(merged.topicsToReview)];
  merged.overview = merged.topics.length
    ? `This document covers ${merged.topics.length} major topic(s): ${merged.topics
        .slice(0, 8)
        .map((t) => t.title)
        .join(', ')}${merged.topics.length > 8 ? ', and more' : ''}.`
    : 'Summary generated from the uploaded material.';

  if (unscannedPages.length) {
    merged.coverageNotes.push(
      `Pages with little or no extractable text (possibly scanned images): ${unscannedPages.join(', ')}. Visual diagrams on those pages were not analyzed.`
    );
  }

  return merged;
}

async function refineMergedSummary(
  draft: StructuredSummary,
  mode: SummaryMode,
  fileName: string
): Promise<StructuredSummary> {
  const compact = {
    topics: draft.topics.map((t) => ({
      title: t.title,
      explanation: t.explanation.slice(0, 600),
      sourcePages: t.sourcePages,
      definitions: t.definitions.slice(0, 5),
      formulas: t.formulas.slice(0, 5),
    })),
    keyConcepts: draft.keyConcepts.slice(0, 40),
    takeaways: draft.takeaways.slice(0, 20),
    examRevisionNotes: draft.examRevisionNotes.slice(0, 20),
    topicsToReview: draft.topicsToReview.slice(0, 15),
    coverageNotes: draft.coverageNotes,
    unscannedPages: draft.unscannedPages,
  };

  const prompt = `You are merging chunk-level study summaries into one coherent document-wide summary.
Document: ${fileName}
Mode: ${mode}
${modeInstructions(mode)}

Draft JSON (from processed chunks):
${JSON.stringify(compact).slice(0, 28000)}

Return ONLY valid JSON with this schema:
{
  "overview": "clear introduction of what the document covers",
  "topics": [{
    "title":"", "explanation":"", "subtopics":[], "definitions":[], "formulas":[],
    "procedures":[], "examples":[], "relationships":[], "sourcePages":[]
  }],
  "keyConcepts": [],
  "definitionsAndFormulas": [{"term":"","definition":"","formula":"","sourcePages":[]}],
  "takeaways": [],
  "examRevisionNotes": [],
  "conceptRelationships": [{"from":"","to":"","relationship":""}],
  "topicsToReview": [],
  "sourceReferences": [{"claim":"","page":1}],
  "coverageNotes": [],
  "unscannedPages": ${JSON.stringify(draft.unscannedPages)}
}

Rules:
- Preserve real source page numbers only; never invent pages.
- Keep ALL major topics represented; do not invent topics, formulas, or claims absent from the draft.
- Organize by document structure.
- Overview must describe the draft content only.`;

  try {
    const text = await callClaude(prompt, 8192, 'Return ONLY valid JSON.');
    const parsed = safeParseJson<StructuredSummary>(text);
    return {
      ...EMPTY_SUMMARY(),
      ...parsed,
      unscannedPages: draft.unscannedPages,
      coverageNotes: [...new Set([...(parsed.coverageNotes || []), ...draft.coverageNotes])],
    };
  } catch (err) {
    console.warn('[Summary] Refine merge failed; using draft merge.', err);
    return draft;
  }
}

export interface GenerateSummaryResult {
  summary: StructuredSummary;
  chunkCount: number;
  pagesCovered: number[];
  pagesFailed: number[];
  complete: boolean;
}

/**
 * Full hierarchical summarization of an uploaded study document.
 */
export async function generateDocumentSummary(
  document: StudyDocument,
  mode: SummaryMode = 'detailed',
  onProgress?: (p: SummaryProgress) => void
): Promise<GenerateSummaryResult> {
  const pages = parsePagedText(document.rawText || '');
  const unscanned = pages.filter((p) => p.isEmpty || p.likelyScanned).map((p) => p.page);
  const chunks = chunkDocument(pages);

  if (chunks.length === 0) {
    throw new Error('No extractable text found in this document. It may be image-only.');
  }

  onProgress?.({
    stage: 'chunking',
    current: 0,
    total: chunks.length,
    message: `Split into ${chunks.length} chunk(s) across ${pages.length} page(s)`,
  });

  const parts: Array<Partial<StructuredSummary> & { topics: TopicSummary[] }> = [];
  const pagesFailed: number[] = [];
  const pagesCovered = new Set<number>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    onProgress?.({
      stage: 'summarizing',
      current: i + 1,
      total: chunks.length,
      message: `Summarizing pages ${chunk.startPage}–${chunk.endPage} (${i + 1}/${chunks.length})`,
    });

    let success = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const part = await summarizeChunk(chunk, mode, document.fileName);
        parts.push(part);
        for (let p = chunk.startPage; p <= chunk.endPage; p++) pagesCovered.add(p);
        success = true;
        break;
      } catch (err) {
        console.warn(`[Summary] Chunk ${chunk.id} attempt ${attempt + 1} failed`, err);
        if (attempt === MAX_RETRIES) {
          // Last resort: always keep grounded extractive notes so the UI is never empty
          parts.push(extractiveChunkSummary(chunk));
          for (let p = chunk.startPage; p <= chunk.endPage; p++) {
            pagesCovered.add(p);
            pagesFailed.push(p);
          }
        }
      }
    }
    if (!success) {
      onProgress?.({
        stage: 'summarizing',
        current: i + 1,
        total: chunks.length,
        message: `Used extractive notes for pages ${chunk.startPage}–${chunk.endPage}`,
      });
    }
  }

  if (parts.length === 0) {
    throw new Error(
      'Could not summarize this document. Re-upload the PDF or check your Claude API key in .env.'
    );
  }

  onProgress?.({
    stage: 'merging',
    current: chunks.length,
    total: chunks.length,
    message: 'Merging chunk summaries into a document-wide summary…',
  });

  const draft = mergePartial(parts, unscanned);
  const refined = await refineMergedSummary(draft, mode, document.fileName);

  const complete = pagesFailed.length === 0 && parts.length === chunks.length;
  if (!complete) {
    refined.coverageNotes.push(
      `Incomplete: ${pagesFailed.length} page(s) failed processing: ${[...new Set(pagesFailed)].join(', ') || 'none'}.`
    );
  }

  onProgress?.({
    stage: 'done',
    current: chunks.length,
    total: chunks.length,
    message: complete ? 'Summary complete' : 'Summary finished with gaps',
  });

  return {
    summary: refined,
    chunkCount: chunks.length,
    pagesCovered: [...pagesCovered].sort((a, b) => a - b),
    pagesFailed: [...new Set(pagesFailed)],
    complete,
  };
}

/** Simple keyword retrieval over original page text. */
export function retrieveRelevantPassages(
  pages: DocumentPage[],
  question: string,
  maxPages = 6
): { page: number; text: string; score: number }[] {
  const terms = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const pageHint = question.match(/page\s+(\d+)/i);
  const scored = pages
    .filter((p) => p.text.trim().length > 0)
    .map((p) => {
      const lower = p.text.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (lower.includes(t)) score += 1;
      }
      if (pageHint && p.page === Number(pageHint[1])) score += 20;
      return { page: p.page, text: p.text, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages);

  if (scored.length === 0 && pageHint) {
    const p = pages.find((x) => x.page === Number(pageHint[1]));
    if (p?.text) return [{ page: p.page, text: p.text, score: 1 }];
  }

  // Fallback: first non-empty pages if nothing matched
  if (scored.length === 0) {
    return pages
      .filter((p) => p.text.trim().length > 40)
      .slice(0, 3)
      .map((p) => ({ page: p.page, text: p.text, score: 0 }));
  }
  return scored;
}

export async function askDocumentQuestion(
  document: StudyDocument,
  question: string,
  history: ChatMessage[],
  options?: { allowGeneralKnowledge?: boolean }
): Promise<{
  answer: string;
  sourcePages: number[];
  followUps: string[];
  usedGeneralKnowledge: boolean;
  foundInDocument: boolean;
}> {
  const pages = parsePagedText(document.rawText || '');
  const passages = retrieveRelevantPassages(pages, question, 6);
  const context = passages
    .map((p) => `[Page ${p.page}]\n${p.text.slice(0, 3500)}`)
    .join('\n\n---\n\n');

  const historyBlock = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Student' : 'StudyBuddy'}: ${m.content}`)
    .join('\n');

  const allowGK = options?.allowGeneralKnowledge === true;

  const prompt = `You are StudyBuddy, answering ONLY from the student's uploaded document unless general knowledge is explicitly allowed.

Document: ${document.fileName}
Allow general knowledge: ${allowGK}

Conversation so far:
${historyBlock || '(none)'}

Retrieved passages from ORIGINAL document text:
"""
${context || '(no passages)'}
"""

Student question: ${question}

Return ONLY JSON:
{
  "foundInDocument": true/false,
  "answer": "direct answer + clear explanation + examples if supported",
  "sourcePages": [page numbers actually used],
  "followUps": ["suggested follow-up 1", "suggested follow-up 2"],
  "usedGeneralKnowledge": false
}

Rules:
- Prefer document passages as the PRIMARY source.
- If insufficient info and allowGeneralKnowledge is false: set foundInDocument=false and clearly say the answer could not be found in the uploaded material.
- If allowGeneralKnowledge is true and document is insufficient: answer with general knowledge, set usedGeneralKnowledge=true, and label that clearly in the answer.
- Never invent page numbers.
- Resolve pronouns using conversation history (e.g. "it" refers to prior topic).`;

  const text = await callClaude(prompt, 2048, 'Return ONLY valid JSON.');
  const parsed = safeParseJson<Record<string, any>>(text);
  return {
    answer: parsed.answer || 'No answer generated.',
    sourcePages: Array.isArray(parsed.sourcePages) ? parsed.sourcePages : passages.map((p) => p.page),
    followUps: Array.isArray(parsed.followUps) ? parsed.followUps.slice(0, 3) : [],
    usedGeneralKnowledge: Boolean(parsed.usedGeneralKnowledge),
    foundInDocument: parsed.foundInDocument !== false,
  };
}

export async function extractConceptsFromSummary(
  summary: StructuredSummary,
  document: StudyDocument
): Promise<ConceptCard[]> {
  const compactTopics = summary.topics.slice(0, 12).map((t) => ({
    title: t.title,
    explanation: (t.explanation || '').slice(0, 220),
    pages: t.sourcePages || [],
    definitions: (t.definitions || []).slice(0, 3),
    subtopics: (t.subtopics || []).slice(0, 4),
    example: (t.examples || [])[0] || '',
  }));

  const prompt = `Extract up to 10 major academic concepts from this study summary for "${document.fileName}".

Overview: ${(summary.overview || '').slice(0, 500)}
Topics: ${JSON.stringify(compactTopics)}
Key concepts: ${JSON.stringify((summary.keyConcepts || []).slice(0, 15))}

Return ONLY a compact JSON array. Keep each string SHORT (detailedExplanation max 2 sentences).
No markdown. No trailing commas. Escape quotes inside strings.

[
  {
    "id": "c1",
    "name": "short name",
    "shortDescription": "1 sentence",
    "detailedExplanation": "2 sentences max",
    "sourcePages": [1],
    "relatedConcepts": ["a"],
    "definitions": ["term: meaning"],
    "example": "one short example"
  }
]

Use only real page numbers from the input.`;

  try {
    const text = await callClaude(
      prompt,
      6000,
      'Return ONLY a valid compact JSON array. Keep explanations short so the JSON is complete.'
    );
    const parsed = safeParseJson(text);
    const cards = normalizeConceptCards(parsed);
    if (cards.length > 0) return cards.slice(0, 12);
    return conceptsFromSummaryFallback(summary);
  } catch (err) {
    console.warn('[Summary] Concept extraction parse failed; using local fallback.', err);
    return conceptsFromSummaryFallback(summary);
  }
}

export async function generateFlashcardsFromMaterial(
  document: StudyDocument,
  summary?: StructuredSummary | null,
  count = 12
): Promise<Flashcard[]> {
  const pages = parsePagedText(document.rawText || '');
  const sample = pages
    .filter((p) => p.text.trim().length > 40)
    .slice(0, 20)
    .map((p) => `[Page ${p.page}] ${p.text.slice(0, 800)}`)
    .join('\n');

  const prompt = `Generate ${count} study flashcards from this uploaded material.
Document: ${document.fileName}
${summary ? `Summary topics: ${summary.topics.map((t) => t.title).join(', ')}` : ''}

Source excerpts:
"""
${sample.slice(0, 14000)}
"""

Return ONLY JSON array:
[{"id":"f1","front":"question or term","back":"source-grounded answer","sourcePage":1}]

Rules:
- Answers must be grounded in the source.
- Include real sourcePage when possible; omit rather than invent.
- Front must not reveal the answer.`;

  const text = await callClaude(prompt, 4096, 'Return ONLY a complete JSON array. Keep answers short.');
  const parsed = safeParseJson(text);
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed as { cards?: Flashcard[] })?.cards || [];
  if (!Array.isArray(list)) return [];
  return list.slice(0, count).map((c: Flashcard, i: number) => ({
    id: c.id || `card_${i}`,
    front: c.front,
    back: c.back,
    sourcePage: c.sourcePage,
    known: false,
    needsReview: false,
  }));
}

type PracticeItem = {
  id: string;
  type: string;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  sourceTopic?: string;
  sourcePage?: number;
};

const BANNED_PRACTICE = [
  /---\s*page/i,
  /\[page\s*\d+\]/i,
  /according to the study material:\s*"/i,
  /is a correct statement/i,
  /is a false statement/i,
  /is not mentioned/i,
  /is partially true/i,
];

function isGoodPracticeItem(q: PracticeItem): boolean {
  if (!q?.question || q.question.trim().length < 20) return false;
  if (!q.correctAnswer || String(q.correctAnswer).trim().length < 1) return false;
  if (BANNED_PRACTICE.some((re) => re.test(`${q.question} ${q.correctAnswer} ${(q.options || []).join(' ')}`))) {
    return false;
  }
  const type = (q.type || '').toLowerCase();
  if (type.includes('multiple') || (q.options && q.options.length > 0)) {
    if (!q.options || q.options.length < 2) return false;
    if (!q.options.includes(q.correctAnswer) && !q.options.some((o) => o.trim() === q.correctAnswer.trim())) {
      return false;
    }
  }
  return true;
}

async function groundedPracticeFallback(
  document: StudyDocument,
  count: number
): Promise<PracticeItem[]> {
  const { generateFallbackQuiz } = await import('./quizService');
  const raw = await generateFallbackQuiz(document.rawText || '', count);
  return raw.map((q) => ({
    id: q.id,
    type: 'multiple_choice',
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation || 'Grounded in your uploaded notes.',
    sourceTopic: q.sourceTopic || 'Content review',
  }));
}

export async function generatePracticeFromDocument(
  document: StudyDocument,
  opts: {
    topics?: string[];
    difficulty?: 'easy' | 'medium' | 'hard';
    count?: number;
    types?: string[];
  }
): Promise<PracticeItem[]> {
  const pages = parsePagedText(document.rawText || '');
  const sample = pages
    .filter((p) => p.text.trim().length > 40)
    .slice(0, 25)
    .map((p) => {
      const cleaned = p.text
        .replace(/---\s*Page\s+\d+\s*---/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 700);
      return `[Page ${p.page}] ${cleaned}`;
    })
    .join('\n');

  const count = opts.count ?? 5;
  const difficulty = opts.difficulty ?? 'medium';
  const types = opts.types?.length
    ? opts.types
    : ['multiple_choice', 'short_answer', 'concept_explanation', 'true_false'];
  const topics = opts.topics?.length ? opts.topics.join(', ') : 'all major topics in the material';

  if (sample.replace(/\s+/g, ' ').trim().length < 80) {
    return groundedPracticeFallback(document, count);
  }

  const prompt = `Generate a practice exam STRICTLY from the student's uploaded study material.
Document: ${document.fileName}
Topics to focus on: ${topics}
Difficulty: ${difficulty}
Number of questions: ${count}
Allowed types: ${types.join(', ')}

Source excerpts (PRIMARY source — do not invent professor exam questions):
"""
${sample.slice(0, 15000)}
"""

Return ONLY JSON array:
[{
  "id":"q1",
  "type":"multiple_choice|short_answer|concept_explanation|application|true_false|problem_solving",
  "question":"Complete interrogative sentence ending with ?",
  "options":["specific option A","specific option B","specific option C","specific option D"],
  "correctAnswer":"must exactly match one option for MCQ",
  "explanation":"brief reason grounded in the material",
  "sourceTopic":"short topic name from the material",
  "sourcePage":1
}]

Hard rules:
- Ground every question in a real fact/concept from the excerpts above.
- Questions must be real questions (end with ?), never paste titles, filenames, or "[Page N]" markers.
- For multiple_choice: exactly 4 DISTINCT plausible options about the content. NEVER use "Is a correct statement", "Is a false statement", "Is not mentioned", or "Is partially true".
- Never invent formulas, names, or procedures that are not in the excerpts.
- Never claim these are real exam questions.
- Use real sourcePage when possible.`;

  try {
    const text = await callClaude(
      prompt,
      5000,
      'Return ONLY a complete JSON array. Keep questions concise. Never invent facts or use placeholder options.'
    );
    const parsed = safeParseJson(text);
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as { questions?: unknown[] })?.questions || [];
    if (!Array.isArray(list)) {
      return groundedPracticeFallback(document, count);
    }

    const accepted = (list as PracticeItem[])
      .map((q, i) => ({
        ...q,
        id: q.id || `q${i + 1}`,
        type: q.type || 'multiple_choice',
        explanation: q.explanation || '',
        correctAnswer: String(q.correctAnswer ?? ''),
        question: String(q.question ?? ''),
      }))
      .filter(isGoodPracticeItem);

    if (accepted.length < count) {
      const topUp = await groundedPracticeFallback(document, count - accepted.length);
      return [...accepted, ...topUp].slice(0, count);
    }
    return accepted.slice(0, count);
  } catch (err) {
    console.warn('[Practice] Claude generation failed, using grounded fallback', err);
    return groundedPracticeFallback(document, count);
  }
}

export function summaryToMarkdown(
  fileName: string,
  mode: SummaryMode,
  summary: StructuredSummary
): string {
  const lines: string[] = [
    `# Summary: ${fileName}`,
    `Mode: ${mode}`,
    '',
    '## 1. Overview',
    summary.overview,
    '',
    '## 2. Topic-by-Topic Summary',
  ];

  for (const t of summary.topics) {
    lines.push(`### ${t.title}`);
    lines.push(t.explanation);
    if (t.subtopics?.length) lines.push(`Subtopics: ${t.subtopics.join('; ')}`);
    if (t.definitions?.length) lines.push(`Definitions: ${t.definitions.join('; ')}`);
    if (t.formulas?.length) lines.push(`Formulas: ${t.formulas.join('; ')}`);
    if (t.procedures?.length) lines.push(`Procedures: ${t.procedures.join('; ')}`);
    if (t.examples?.length) lines.push(`Examples: ${t.examples.join('; ')}`);
    if (t.sourcePages?.length) lines.push(`Source: Page ${t.sourcePages.join(', ')}`);
    lines.push('');
  }

  lines.push('## 3. Key Concepts', ...summary.keyConcepts.map((c) => `- ${c}`), '');
  lines.push('## 4. Definitions and Formulas');
  for (const d of summary.definitionsAndFormulas) {
    lines.push(`- **${d.term}**: ${d.definition}${d.formula ? ` | Formula: ${d.formula}` : ''}${d.sourcePages?.length ? ` (p. ${d.sourcePages.join(', ')})` : ''}`);
  }
  lines.push('', '## 5. Important Takeaways', ...summary.takeaways.map((t) => `- ${t}`));
  lines.push('', '## 6. Exam Revision Notes', ...summary.examRevisionNotes.map((t) => `- ${t}`));
  lines.push('', '## 7. Concept Relationships');
  for (const r of summary.conceptRelationships) {
    lines.push(`- ${r.from} → ${r.to}: ${r.relationship}`);
  }
  lines.push('', '## 8. Topics to Review', ...summary.topicsToReview.map((t) => `- ${t}`));
  lines.push('', '## 9. Source References');
  for (const s of summary.sourceReferences) {
    lines.push(`- "${s.claim}" — Source: Page ${s.page}`);
  }
  if (summary.coverageNotes.length) {
    lines.push('', '## Coverage Notes', ...summary.coverageNotes.map((n) => `- ${n}`));
  }
  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string, mime = 'text/markdown') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function openPrintableSummary(title: string, markdown: string) {
  const html = `<!DOCTYPE html><html><head><title>${title}</title>
  <style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.5;color:#111}
  h1,h2,h3{color:#4c1d95} pre{white-space:pre-wrap}</style></head>
  <body><pre>${markdown.replace(/</g, '&lt;')}</pre>
  <script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
