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
import {
  ADMIN_ONLY_MESSAGE,
  AdministrativeOnlyError,
  COURSE_POLICY_TOPIC_PREFIX,
  MIN_ACADEMIC_CHARS,
  academicOnlySummary,
  buildSummaryView,
  classifyDocumentText,
  classifyPassage,
  isAdministrativeLabel,
  isAdministrativeTopic,
  plainCoverageNote,
} from './contentClassification';
import type { CourseInfoItem } from '../types/summary';
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
  const pageLabel = chunk.startPage === chunk.endPage ? `Page ${chunk.startPage} was` : `Pages ${chunk.startPage}–${chunk.endPage} were`;
  const fallbackNote = `${pageLabel} summarized straight from the extracted text because the AI service didn’t respond. Generate the summary again for fuller explanations.`;

  // Logistics-only text becomes course information, never a study topic.
  if (isAdministrativeLabel(title) || classifyPassage(plain) === 'administrative') {
    return {
      topics: [],
      courseInfo: [{ title, details: sentences.slice(0, 5), sourcePages: pages }],
      keyConcepts: [],
      coverageNotes: [fallbackNote],
    };
  }

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
    // Single words pulled from sentences are not concepts; leave the chips empty.
    keyConcepts: [],
    definitionsAndFormulas: [],
    takeaways: sentences.slice(0, 3),
    examRevisionNotes: sentences.slice(0, 2),
    conceptRelationships: [],
    topicsToReview: [title],
    sourceReferences: sentences.slice(0, 2).map((claim) => ({
      claim,
      page: chunk.startPage,
    })),
    coverageNotes: [fallbackNote],
  };
}

/** Move any administrative topics the model returned into course information. */
function separateCourseInfo<T extends Partial<StructuredSummary> & { topics: TopicSummary[] }>(part: T): T {
  const academic: TopicSummary[] = [];
  const info: CourseInfoItem[] = [...(part.courseInfo || [])];
  for (const t of part.topics || []) {
    if (isAdministrativeTopic(t)) {
      info.push({
        title: t.title,
        details: [t.explanation, ...(t.procedures || [])].filter((d) => d && d.trim()).slice(0, 6),
        sourcePages: t.sourcePages || [],
      });
    } else {
      academic.push({ ...t, category: 'academic' });
    }
  }
  return {
    ...part,
    topics: academic,
    courseInfo: info,
    keyConcepts: (part.keyConcepts || []).filter((k) => !isAdministrativeLabel(k)),
    topicsToReview: (part.topicsToReview || []).filter((k) => !isAdministrativeLabel(k)),
  };
}

function normalizeCourseInfo(raw: unknown): CourseInfoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      title: String(c.title || 'Course information'),
      details: Array.isArray(c.details)
        ? (c.details as unknown[]).map(String).filter(Boolean)
        : c.details
          ? [String(c.details)]
          : [],
      sourcePages: Array.isArray(c.sourcePages)
        ? (c.sourcePages as unknown[]).map(Number).filter((n) => !Number.isNaN(n))
        : [],
    }));
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
- Use ONLY information from the text below. Do NOT invent concepts, formulas, or page numbers.
- Include real page numbers from [Page N] markers. NEVER invent page numbers.
- Prefer concrete definitions, procedures, and examples that appear in the text.
- If the text is mostly titles/headers, summarize what it is about without fabricating details.
- SEPARATE learning content from course administration:
  * "topics", "keyConcepts", "definitionsAndFormulas", "takeaways", "examRevisionNotes" and "topicsToReview" contain ONLY subject matter a student would learn or practice (theories, methods, definitions, worked examples).
  * Deadlines, due dates, grading breakdowns, late or submission policies, attendance, participation rules, office hours, contact details, communication channels, academic integrity, textbooks, prerequisites and course schedules go ONLY in "courseInfo".
  * A week-by-week schedule that only lists topic names is course information, not academic content.
  * If the text is only course administration, return "topics": [] and put everything in "courseInfo". Never invent academic content to fill topics.
- "keyConcepts": at most 6 short concept names that the text actually explains.
- "coverageNotes": only when something is genuinely missing, described plainly by page (e.g. "Page 4 is a diagram with no readable text"). Never mention chunks, boundaries or internal processing.
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
  "coverageNotes": ["string"],
  "courseInfo": [{"title":"e.g. Late submission policy","details":["fact stated in the text"],"sourcePages":[1]}]
}`;

  try {
    const text = await callClaude(prompt, 4096, 'Return ONLY valid JSON. No markdown. Never invent facts.');
    const parsed = safeParseJson<Record<string, any>>(text);
    const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
    const courseInfo = normalizeCourseInfo(parsed.courseInfo);
    if (!topics.length && !(parsed.takeaways?.length) && !courseInfo.length) {
      return extractiveChunkSummary(chunk);
    }
    return separateCourseInfo({
      topics,
      courseInfo,
      keyConcepts: parsed.keyConcepts ?? [],
      definitionsAndFormulas: parsed.definitionsAndFormulas ?? [],
      takeaways: parsed.takeaways ?? [],
      examRevisionNotes: parsed.examRevisionNotes ?? [],
      conceptRelationships: parsed.conceptRelationships ?? [],
      topicsToReview: parsed.topicsToReview ?? [],
      sourceReferences: parsed.sourceReferences ?? [],
      coverageNotes: (parsed.coverageNotes ?? []).map(plainCoverageNote),
    });
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
  const courseInfo: CourseInfoItem[] = [];

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
    courseInfo.push(...(part.courseInfo || []));
  }
  merged.courseInfo = courseInfo;

  merged.topics = [...topicMap.values()];
  merged.keyConcepts = [...new Set(merged.keyConcepts)];
  merged.takeaways = [...new Set(merged.takeaways)];
  merged.examRevisionNotes = [...new Set(merged.examRevisionNotes)];
  merged.topicsToReview = [...new Set(merged.topicsToReview)];
  merged.overview = merged.topics.length
    ? `This material covers ${merged.topics
        .slice(0, 8)
        .map((t) => t.title)
        .join(', ')}${merged.topics.length > 8 ? ', and more' : ''}.`
    : courseInfo.length
      ? ADMIN_ONLY_MESSAGE
      : 'No study content could be read from this material.';
  merged.documentKind = merged.topics.length ? (courseInfo.length ? 'mixed' : 'academic') : 'administrative';
  merged.coverageNotes = [...new Set(merged.coverageNotes.map(plainCoverageNote))];

  if (unscannedPages.length) {
    merged.coverageNotes.push(
      `Page${unscannedPages.length === 1 ? '' : 's'} ${unscannedPages.join(', ')} ha${unscannedPages.length === 1 ? 's' : 've'} little or no readable text (possibly a scan or diagram), so ${unscannedPages.length === 1 ? 'it isn’t' : 'they aren’t'} included in this summary.`
    );
  }

  return merged;
}

async function refineMergedSummary(
  draft: StructuredSummary,
  mode: SummaryMode,
  fileName: string
): Promise<StructuredSummary> {
  // Nothing academic to merge: don't ask the model to write a study summary.
  if (draft.topics.length === 0) return draft;

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
  "overview": "1-2 sentences on what this material teaches (subject matter only, no logistics)",
  "whatItTeaches": "the same idea written to the student, e.g. 'This lecture explains ...'",
  "practiceNext": ["2-4 concrete practice actions tied to specific topics and pages in the draft, e.g. 'Rework the example on page 3 without notes, then compare.'"],
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
- Overview must describe the draft content only.
- "keyConcepts": at most 8 core academic concepts, not a long list of terms.
- Leave course administration (deadlines, grading, attendance, submission or communication policies) out of every field; it is handled separately.
- Never mention chunks, drafts or internal processing in any field.`;

  try {
    const text = await callClaude(prompt, 8192, 'Return ONLY valid JSON.');
    const parsed = safeParseJson<StructuredSummary>(text);
    const refined = separateCourseInfo({
      ...EMPTY_SUMMARY(),
      ...parsed,
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      courseInfo: [],
      unscannedPages: draft.unscannedPages,
      coverageNotes: [
        ...new Set([...(parsed.coverageNotes || []), ...draft.coverageNotes].map(plainCoverageNote)),
      ],
    });
    const courseInfo = [...(draft.courseInfo || []), ...(refined.courseInfo || [])];
    if (!refined.topics.length) {
      // The merge step dropped every topic; keep the grounded draft instead.
      return { ...draft, courseInfo };
    }
    return { ...refined, courseInfo, documentKind: courseInfo.length ? 'mixed' : 'academic' };
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
    message: `Reading ${pages.length} page${pages.length === 1 ? '' : 's'}…`,
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
      message:
        chunk.startPage === chunk.endPage
          ? `Summarizing page ${chunk.startPage}`
          : `Summarizing pages ${chunk.startPage}–${chunk.endPage}`,
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
        message: `Using the document text directly for pages ${chunk.startPage}–${chunk.endPage}`,
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
    message: 'Putting the summary together…',
  });

  const draft = mergePartial(parts, unscanned);
  const refined = await refineMergedSummary(draft, mode, document.fileName);

  const complete = pagesFailed.length === 0 && parts.length === chunks.length;
  if (!complete) {
    const failed = [...new Set(pagesFailed)].sort((a, b) => a - b);
    refined.coverageNotes.push(
      failed.length
        ? `Page${failed.length === 1 ? '' : 's'} ${failed.join(', ')} couldn’t be summarized by the AI service, so ${failed.length === 1 ? 'it shows' : 'they show'} text taken directly from the document.`
        : 'Part of this document couldn’t be summarized. Generate the summary again to fill the gaps.'
    );
  }

  onProgress?.({
    stage: 'done',
    current: chunks.length,
    total: chunks.length,
    message: complete ? 'Summary ready' : 'Summary ready, with a few pages missing',
  });

  const kind = buildSummaryView(refined).kind;
  refined.documentKind = kind;
  if (kind === 'administrative') refined.overview = ADMIN_ONLY_MESSAGE;

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
  summary = academicOnlySummary(summary);
  // No academic topics: nothing to extract, and no reason to pay for a call.
  if (summary.topics.length === 0) return [];

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

Use only real page numbers from the input.
Only include subject-matter concepts. Never include course logistics such as deadlines, grading, attendance or submission policies.`;

  try {
    const text = await callClaude(
      prompt,
      6000,
      'Return ONLY a valid compact JSON array. Keep explanations short so the JSON is complete.'
    );
    const parsed = safeParseJson(text);
    const cards = normalizeConceptCards(parsed).filter((c) => !isAdministrativeLabel(c.name));
    if (cards.length > 0) return cards.slice(0, 10);
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
  const classified = classifyDocumentText(document.rawText || '');
  if (classified.academicChars < MIN_ACADEMIC_CHARS) throw new AdministrativeOnlyError();
  const pages = parsePagedText(classified.academicText);
  const sample = pages
    .filter((p) => p.text.trim().length > 40)
    .slice(0, 20)
    .map((p) => `[Page ${p.page}] ${p.text.slice(0, 800)}`)
    .join('\n');
  const academicTopics = summary ? buildSummaryView(summary).academicTopics.map((t) => t.title) : [];

  const prompt = `Generate ${count} study flashcards from this uploaded material.
Document: ${document.fileName}
${academicTopics.length ? `Summary topics: ${academicTopics.join(', ')}` : ''}

Source excerpts:
"""
${sample.slice(0, 14000)}
"""

Return ONLY JSON array:
[{"id":"f1","front":"question or term","back":"source-grounded answer","sourcePage":1}]

Rules:
- Answers must be grounded in the source.
- Include real sourcePage when possible; omit rather than invent.
- Front must not reveal the answer.
- Cover subject matter only; skip deadlines, grading, attendance and other course logistics.`;

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
  sourceText: string,
  count: number,
  topicPrefix?: string
): Promise<PracticeItem[]> {
  const { generateFallbackQuiz } = await import('./quizService');
  const raw = await generateFallbackQuiz(sourceText, count);
  return raw.map((q) => ({
    id: q.id,
    type: 'multiple_choice',
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation || 'Grounded in your uploaded notes.',
    sourceTopic: topicPrefix ? `${topicPrefix} · ${q.sourceTopic || 'General'}` : q.sourceTopic || 'Content review',
  }));
}

export async function generatePracticeFromDocument(
  document: StudyDocument,
  opts: {
    topics?: string[];
    difficulty?: 'easy' | 'medium' | 'hard';
    count?: number;
    types?: string[];
    /** 'academic' (default) skips course logistics; 'course_policies' quizzes only on them. */
    focus?: 'academic' | 'course_policies';
  }
): Promise<PracticeItem[]> {
  const focus = opts.focus ?? 'academic';
  const classified = classifyDocumentText(document.rawText || '');
  if (focus === 'academic' && classified.academicChars < MIN_ACADEMIC_CHARS) {
    throw new AdministrativeOnlyError();
  }
  if (focus === 'course_policies' && !classified.administrativeText.trim()) {
    throw new Error('No course policies were found in this material.');
  }
  const sourceText = focus === 'academic' ? classified.academicText : classified.administrativeText;
  const topicPrefix = focus === 'course_policies' ? COURSE_POLICY_TOPIC_PREFIX : undefined;
  const pages = parsePagedText(sourceText);
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
    return groundedPracticeFallback(sourceText, count, topicPrefix);
  }

  const focusRule =
    focus === 'course_policies'
      ? '- These excerpts are course policies and logistics. Ask about the stated rules only. Each sourceTopic is the policy name (e.g. "Late submission").'
      : '- Ask only about subject matter. Never ask about deadlines, grading, attendance, submission or communication policies.';

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
- Use real sourcePage when possible.
${focusRule}`;

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
      return groundedPracticeFallback(sourceText, count, topicPrefix);
    }

    const accepted = (list as PracticeItem[])
      .map((q, i) => ({
        ...q,
        id: q.id || `q${i + 1}`,
        type: q.type || 'multiple_choice',
        explanation: q.explanation || '',
        correctAnswer: String(q.correctAnswer ?? ''),
        question: String(q.question ?? ''),
        sourceTopic: topicPrefix ? `${topicPrefix} · ${q.sourceTopic || 'General'}` : q.sourceTopic,
      }))
      .filter(isGoodPracticeItem);

    if (accepted.length < count) {
      const topUp = await groundedPracticeFallback(sourceText, count - accepted.length, topicPrefix);
      return [...accepted, ...topUp].slice(0, count);
    }
    return accepted.slice(0, count);
  } catch (err) {
    console.warn('[Practice] Claude generation failed, using grounded fallback', err);
    return groundedPracticeFallback(sourceText, count, topicPrefix);
  }
}

export function summaryToMarkdown(
  fileName: string,
  mode: SummaryMode,
  summary: StructuredSummary
): string {
  const view = buildSummaryView(summary);
  const lines: string[] = [`# Summary: ${fileName}`, `Mode: ${mode}`, '', '## What this material teaches', view.overview, ''];

  if (view.academicTopics.length) {
    lines.push('## Core concepts and explanations');
    for (const t of view.academicTopics) {
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
  }
  if (view.definitionsAndFormulas.length) {
    lines.push('## Definitions and formulas');
    for (const d of view.definitionsAndFormulas) {
      lines.push(
        `- **${d.term}**: ${d.definition}${d.formula ? ` | Formula: ${d.formula}` : ''}${d.sourcePages?.length ? ` (p. ${d.sourcePages.join(', ')})` : ''}`
      );
    }
    lines.push('');
  }
  if (view.takeaways.length) lines.push('## Key takeaways', ...view.takeaways.map((t) => `- ${t}`), '');
  if (view.practiceNext.length) lines.push('## What to practice next', ...view.practiceNext.map((t) => `- ${t}`), '');
  if (view.examRevisionNotes.length) lines.push('## Exam revision notes', ...view.examRevisionNotes.map((t) => `- ${t}`), '');
  if (view.courseInfo.length) {
    lines.push('## Course information');
    for (const c of view.courseInfo) {
      lines.push(`### ${c.title}`, ...c.details.map((d) => `- ${d}`));
      if (c.sourcePages.length) lines.push(`Source: Page ${c.sourcePages.join(', ')}`);
      lines.push('');
    }
  }
  if (summary.sourceReferences?.length) {
    lines.push('## Source references');
    for (const s of summary.sourceReferences) lines.push(`- "${s.claim}" — Source: Page ${s.page}`);
    lines.push('');
  }
  if (view.coverageNotes.length) lines.push('## Notes on coverage', ...view.coverageNotes.map((n) => `- ${n}`));
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
