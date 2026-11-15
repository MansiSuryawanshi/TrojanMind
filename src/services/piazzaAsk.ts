/**
 * Ask AI over authorized Piazza discussions — reuses the existing Claude proxy.
 * Pulls the Discussions feed + targeted searches (not a single thin keyword hit).
 */
import { AI_ENDPOINT, aiFetch } from './aiClient';
import { ANTHROPIC_MODEL } from '../config/aiConfig';
import { fetchPiazzaPosts, readPiazzaPosts } from './piazzaApi';
import type { PiazzaAskMessage, PiazzaPostDetail, PiazzaPostSummary } from '../types/piazza';

const STOP = new Set([
  'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
  'the', 'and', 'for', 'are', 'is', 'was', 'were', 'does', 'did', 'have', 'has',
  'about', 'from', 'this', 'that', 'with', 'into', 'onto', 'your', 'you', 'any',
  'there', 'their', 'they', 'them', 'been', 'been', 'someone', 'anyone',
]);

/** Keep short course tokens like TA / OH / hw. */
function extractKeywords(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !STOP.has(w))
    .filter((w) => w.length >= 2)
    .slice(0, 10);
}

function searchQueries(question: string, keywords: string[]): string[] {
  const q = question.trim();
  const queries: string[] = [];
  if (keywords.length) queries.push(keywords.slice(0, 4).join(' '));
  // Logistics aliases students often need
  if (/\boffice\s*hours?\b|\boh\b/i.test(q)) {
    queries.push('office hours', 'OH', 'TA hours');
  }
  if (/\bta\b|teaching assistant/i.test(q)) {
    queries.push('TA', 'teaching assistant');
  }
  if (/\b(syllabus|deadline|due|exam|midterm|final)\b/i.test(q)) {
    queries.push(...keywords.filter((k) => /syllabus|deadline|due|exam|midterm|final/i.test(k)));
  }
  return [...new Set(queries.map((s) => s.trim()).filter(Boolean))].slice(0, 5);
}

function postKey(p: PiazzaPostSummary | PiazzaPostDetail): string {
  return p.nr != null ? `nr:${p.nr}` : `id:${p.id}`;
}

function scorePost(p: PiazzaPostSummary, keywords: string[], question: string): number {
  const hay = `${p.subject} ${p.snippet} ${p.folders.join(' ')}`.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    if (hay.includes(k.toLowerCase())) score += k.length <= 3 ? 3 : 2;
  }
  if (/\boffice\s*hours?\b|\boh\b/i.test(question) && /office\s*hours?|\boh\b|hours/i.test(hay)) score += 6;
  if (/\bta\b/i.test(question) && /\bta\b|teaching assistant/i.test(hay)) score += 5;
  if (p.pinned) score += 2;
  if (p.isAnnouncement) score += 2;
  if (p.hasInstructorAnswer) score += 1;
  // Mild recency preference via modifiedAt presence
  if (p.modifiedAt) score += 0.5;
  return score;
}

function messageText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b): b is { type: string; text: string } => !!b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function formatPostForPrompt(p: PiazzaPostDetail): string {
  const instructor = p.answers.find((a) => a.type === 'instructor');
  const student = p.answers.find((a) => a.type === 'student');
  const lines = [
    `POST @${p.nr ?? p.id}`,
    `URL: ${p.url}`,
    `Folders: ${p.folders.join(', ') || '(none)'}`,
    `Subject: ${p.subject}`,
    `Body: ${p.body.slice(0, 1500)}`,
  ];
  if (instructor) lines.push(`Instructor answer (verified): ${instructor.text.slice(0, 1500)}`);
  if (student) {
    lines.push(
      `Student answer${student.endorsedByInstructor ? ' (instructor-endorsed)' : ''}: ${student.text.slice(0, 900)}`,
    );
  }
  for (const f of p.followups.slice(0, 3)) {
    if (f.text) lines.push(`Follow-up: ${f.text.slice(0, 400)}`);
  }
  return lines.join('\n');
}

async function readInBatches(classId: string, refs: Array<string | number>): Promise<PiazzaPostDetail[]> {
  const unique = [...new Set(refs.map((r) => String(r)))];
  const out: PiazzaPostDetail[] = [];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const details = await readPiazzaPosts(classId, chunk);
    out.push(...details);
  }
  return out;
}

/**
 * Gather discussions like the Discussions tab: recent feed + keyword searches,
 * then rank and fully read the best matches for Claude.
 */
async function gatherDiscussionCorpus(
  classId: string,
  question: string,
): Promise<{ summaries: PiazzaPostSummary[]; details: PiazzaPostDetail[]; coverageNote: string }> {
  const keywords = extractKeywords(question);
  const queries = searchQueries(question, keywords);

  const [recent, ...searchBatches] = await Promise.all([
    fetchPiazzaPosts(classId, { limit: 80 }),
    ...queries.map((q) => fetchPiazzaPosts(classId, { q, limit: 40 }).catch(() => ({ posts: [] as PiazzaPostSummary[], coverageNote: '' }))),
  ]);

  const byKey = new Map<string, PiazzaPostSummary>();
  for (const p of recent.posts) byKey.set(postKey(p), p);
  for (const batch of searchBatches) {
    for (const p of batch.posts) byKey.set(postKey(p), p);
  }

  const merged = [...byKey.values()];
  if (merged.length === 0) {
    return { summaries: [], details: [], coverageNote: recent.coverageNote };
  }

  const ranked = merged
    .map((p) => ({ p, score: scorePost(p, keywords, question) }))
    .sort((a, b) => b.score - a.score || String(b.p.modifiedAt ?? '').localeCompare(String(a.p.modifiedAt ?? '')));

  // Always keep strong matches; also keep a slice of the recent feed so Ask AI
  // sees the same discussion pool the Discussions tab shows.
  const selectedKeys = new Set<string>();
  const selected: PiazzaPostSummary[] = [];

  for (const { p, score } of ranked) {
    if (score > 0 && selected.length < 20) {
      selected.push(p);
      selectedKeys.add(postKey(p));
    }
  }
  for (const p of recent.posts) {
    if (selected.length >= 25) break;
    const k = postKey(p);
    if (!selectedKeys.has(k)) {
      selected.push(p);
      selectedKeys.add(k);
    }
  }
  // If nothing scored, still use the recent discussion list.
  if (selected.length === 0) {
    selected.push(...recent.posts.slice(0, 25));
  }

  const refs = selected.map((p) => (p.nr != null ? p.nr : p.id)).filter(Boolean);
  const details = await readInBatches(classId, refs);

  // Re-rank details with full body text.
  const detailRanked = details
    .map((d) => {
      const hay = `${d.subject} ${d.body} ${d.answers.map((a) => a.text).join(' ')}`.toLowerCase();
      let score = scorePost(d, keywords, question);
      for (const k of keywords) {
        if (hay.includes(k.toLowerCase())) score += 2;
      }
      if (d.hasInstructorAnswer) score += 1;
      return { d, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.d);

  return {
    summaries: selected,
    details: detailRanked,
    coverageNote: `${recent.coverageNote} Ask AI also searched: ${queries.join(', ') || '(recent feed only)'}.`,
  };
}

export async function askPiazzaQuestion(
  classId: string,
  courseLabel: string,
  question: string,
  history: PiazzaAskMessage[],
  studyExcerpt?: string | null,
): Promise<{ answer: string; sources: { title: string; url: string; postNr: number | null }[]; found: boolean }> {
  const { details, coverageNote } = await gatherDiscussionCorpus(classId, question);
  if (details.length === 0) {
    return {
      answer: `No Piazza discussions could be loaded for ${courseLabel}. Open the Discussions tab and Sync Now, then try again.`,
      sources: [],
      found: false,
    };
  }

  // Prefer instructor-answered posts when presenting sources, but keep all
  // retrieved discussion content in the corpus for answering.
  const corpus = details
    .slice(0, 20)
    .map(formatPostForPrompt)
    .join('\n\n---\n\n');

  const studyBlock = studyExcerpt?.trim()
    ? `\n\nOptional study material from the same mapped course (use only if on-topic):\n${studyExcerpt.slice(0, 2500)}`
    : '';

  const system = `You are TrojanMind’s Piazza Assistant for ${courseLabel}.
Answer ONLY from the authorized Piazza posts provided.
Prefer verified instructor answers when present.
Never invent posts, deadlines, office hours, or instructor statements.

STYLE — keep answers SHORT:
- Max 3 short sentences (or 3 bullets).
- Lead with the direct answer.
- Cite at most 1–2 posts as @number only (no long quotes, no URL lists in the text).
- Do not dump every related post. Do not list homework/exam grade threads unless asked.
- If unknown from the posts, say so in one sentence.
Coverage note: ${coverageNote}`;

  const prior = history.slice(-6).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const res = await aiFetch(AI_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 450,
      thinking: { type: 'between_tools' },
      output_config: { effort: 'low' },
      system,
      messages: [
        ...prior,
        {
          role: 'user',
          content: `Piazza discussions for this class (${details.length} posts loaded):\n\n${corpus}${studyBlock}\n\nStudent question: ${question}\n\nReply with a brief summary only.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = typeof errBody?.error?.message === 'string' ? errBody.error.message : '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || 'Ask AI failed. Check that ANTHROPIC_API_KEY is set in server/.env.local and restart npm run dev.');
  }
  const data = await res.json();
  const answer = messageText(data) || 'I could not generate an answer from the Piazza sources.';

  const keywords = extractKeywords(question);
  const sources = details
    .map((p) => ({ p, score: scorePost(p, keywords, question) }))
    .filter((x) => x.score > 0)
    .slice(0, 2)
    .map(({ p }) => ({ title: p.subject, url: p.url, postNr: p.nr }));

  // At most 2 source chips — never a long related-thread dump.
  const finalSources =
    sources.length > 0
      ? sources
      : details.slice(0, 2).map((p) => ({ title: p.subject, url: p.url, postNr: p.nr }));

  return { answer, sources: finalSources, found: true };
}
