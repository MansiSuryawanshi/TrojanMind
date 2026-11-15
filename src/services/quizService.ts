
export type QuestionType = "mcq";

export interface GeneratedQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  sourceTopic?: string;
}

import { ANTHROPIC_MODEL, ANTHROPIC_FALLBACK_MODEL } from "../config/aiConfig";

import { AI_ENDPOINT as CLAUDE_URL, aiFetch } from './aiClient';

/** Strip PDF page markers and noise so quizzes never quote "--- Page 1 ---". */
export function cleanContentForQuiz(content: string): string {
  return content
    .replace(/---\s*Page\s+\d+\s*---/gi, ' ')
    .replace(/\[Page\s+\d+\]/gi, ' ')
    .replace(/\[Parsing Content from.*?\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function messageText(data: { content?: { type?: string; text?: string }[] }): string {
  const text = (data.content ?? [])
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .filter((part) => part.trim().length > 0)
    .join('\n')
    .trim();
  if (!text) throw new Error('Claude returned no answer text.');
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

const BANNED_QUESTION_PATTERNS = [
  /---\s*page/i,
  /\[page\s*\d+\]/i,
  /according to the study material:\s*"/i,
  /is a correct statement/i,
  /is a false statement/i,
  /is not mentioned/i,
  /is partially true/i,
  /\[parsing/i,
  /placeholder/i,
  /filename/i,
];

const BANNED_OPTION_PATTERNS = [
  /^is a correct statement$/i,
  /^is a false statement$/i,
  /^is not mentioned$/i,
  /^is partially true$/i,
  /^an unrelated concept$/i,
  /^a general distractor$/i,
  /^a contrasting idea$/i,
];

/**
 * Validates that a generated question is grounded and usable.
 */
export function validateQuestionQuality(q: GeneratedQuestion): boolean {
  if (!q?.question || q.question.trim().length < 20) return false;
  if (!q.options || q.options.length !== 4) return false;
  if (!q.correctAnswer || !q.options.includes(q.correctAnswer)) return false;

  const unique = new Set(q.options.map((o) => o.trim().toLowerCase()));
  if (unique.size < 4) return false;

  const blob = `${q.question} ${q.correctAnswer} ${q.options.join(' ')}`;
  if (BANNED_QUESTION_PATTERNS.some((re) => re.test(blob))) return false;
  if (q.options.some((o) => BANNED_OPTION_PATTERNS.some((re) => re.test(o.trim())))) return false;

  // Reject questions that are mostly a pasted title/header fragment
  if (/^[A-Z][^.?]{0,40}$/.test(q.question.trim()) && !q.question.includes('?')) return false;

  return true;
}

async function callQuizClaude(prompt: string, maxTokens = 3500): Promise<string> {

  const models = [ANTHROPIC_MODEL, ANTHROPIC_FALLBACK_MODEL, 'claude-sonnet-5', 'claude-haiku-5-5'];
  let lastErr = '';

  for (const model of models) {
    const isSonnet55 = /sonnet-5-5/i.test(model);
    const headers = { 'Content-Type': 'application/json' };
    const base = {
      model,
      max_tokens: maxTokens,
      system:
        'You write rigorous study quizzes ONLY from the provided material. Never invent facts. Never quote page markers. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    };

    let response = await aiFetch(CLAUDE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...base,
        thinking: { type: isSonnet55 ? 'between_tools' : 'disabled' },
        output_config: { effort: 'low' },
      }),
    });

    if (!response.ok && (response.status === 400 || response.status === 404)) {
      lastErr = await response.text();
      response = await aiFetch(CLAUDE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(base),
      });
    }

    if (response.ok) {
      const data = await response.json();
      return messageText(data);
    }

    lastErr = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Claude API auth error ${response.status}: check ANTHROPIC_API_KEY in server/.env.local`);
    }
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
  }

  throw new Error(`Claude API unavailable: ${lastErr.slice(0, 300)}`);
}

/**
 * Generates an MCQ-only quiz from the provided study material using the Claude API.
 */
export async function generateQuizFromContent(content: string, questionCount: number = 5): Promise<GeneratedQuestion[]> {
  const cleaned = cleanContentForQuiz(content).slice(0, 14000);
  console.group(`[QuizService-Pipeline] MCQ GENERATION START`);

  if (cleaned.length < 80) {
    console.warn('Material too short for grounded quiz.');
    console.groupEnd();
    return generateFallbackQuiz(content, questionCount);
  }

  const prompt = `Create a Multiple Choice quiz STRICTLY from this study material.

MATERIAL:
"""
${cleaned}
"""

Rules:
1. Generate exactly ${questionCount} MULTIPLE-CHOICE questions only. NO short answer, NO true/false-only, NO free response.
2. Each question must be a complete interrogative sentence ending with ?.
3. Exactly 4 distinct, plausible options (A–D style text). One correct answer that EXACTLY matches one option string.
4. NEVER use page markers, filenames, or paste document titles into the question.
5. NEVER use options like "Is a correct statement", "Is a false statement", "Is not mentioned".
6. Do NOT invent concepts not present in the material.
7. Prefer conceptual / application questions over trivial wording matches.
8. type must always be "mcq".
9. Return ONLY a JSON array:
[
  {
    "id": "q1",
    "type": "mcq",
    "question": "What is ...?",
    "options": ["...", "...", "...", "..."],
    "correctAnswer": "...",
    "explanation": "Why, grounded in the material",
    "sourceTopic": "short topic name"
  }
]`;

  try {
    const text = await callQuizClaude(prompt);
    const rawParsed = JSON.parse(extractJson(text)) as GeneratedQuestion[];
    const accepted = (Array.isArray(rawParsed) ? rawParsed : [])
      .map((q, i) => {
        const options = (q.options || [])
          .map((o) => String(o).trim())
          .filter(Boolean)
          .slice(0, 4);
        return {
          ...q,
          id: q.id || `q${i + 1}`,
          type: 'mcq' as const,
          question: String(q.question || '').trim(),
          options,
          correctAnswer: String(q.correctAnswer || '').trim(),
        };
      })
      .filter((q) => q.type === 'mcq' && validateQuestionQuality(q));

    if (accepted.length < questionCount) {
      const topUp = await generateFallbackQuiz(content, questionCount - accepted.length);
      console.groupEnd();
      return [...accepted, ...topUp].slice(0, questionCount);
    }

    console.groupEnd();
    return accepted.slice(0, questionCount);
  } catch (error) {
    console.error('[QuizService] Claude quiz failed, using grounded fallback:', error);
    console.groupEnd();
    return generateFallbackQuiz(content, questionCount);
  }
}

function extractKeyPhrases(sentence: string): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'your', 'their',
    'about', 'when', 'what', 'which', 'while', 'have', 'been', 'were', 'will',
    'also', 'than', 'then', 'them', 'they', 'such', 'using', 'used', 'use',
  ]);
  return sentence
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !stop.has(w.toLowerCase()))
    .slice(0, 8);
}

/**
 * Content-grounded MCQ fallback (never uses "Is a correct statement" style).
 */
export async function generateFallbackQuiz(content: string, count: number): Promise<GeneratedQuestion[]> {
  console.log(`[QuizService-Fallback] Grounded MCQ Mode: Generating ${count} questions...`);

  const cleanContent = cleanContentForQuiz(content);
  const sentences = cleanContent
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 220 && !/page\s+\d+/i.test(s));

  const questions: GeneratedQuestion[] = [];
  const phrasePool = sentences.flatMap(extractKeyPhrases);
  const uniquePhrases = [...new Set(phrasePool.map((p) => p))];

  for (let i = 0; i < count; i++) {
    const id = `fb-mcq-${i}-${Date.now()}`;
    const s = sentences[i % Math.max(sentences.length, 1)];

    if (!s || uniquePhrases.length < 4) {
      questions.push({
        id,
        type: 'mcq',
        question: 'Based on the uploaded material, what is the best next study action?',
        options: [
          'Review the core concepts and definitions in the notes',
          'Ignore the uploaded material entirely',
          'Only memorize page numbers',
          'Skip difficult sections permanently',
        ],
        correctAnswer: 'Review the core concepts and definitions in the notes',
        explanation: 'Fallback used because the material was too thin to build a specific item.',
        sourceTopic: 'Study strategy',
      });
      continue;
    }

    const keys = extractKeyPhrases(s);
    const correct = keys[0] || uniquePhrases[i % uniquePhrases.length];
    const distractors = uniquePhrases
      .filter((p) => p.toLowerCase() !== correct.toLowerCase())
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    while (distractors.length < 3) {
      distractors.push(`Concept ${distractors.length + 1}`);
    }

    const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
    const snippet = s.length > 110 ? `${s.slice(0, 110)}…` : s;

    questions.push({
      id,
      type: 'mcq',
      question: `In the uploaded material, which term or idea is central to this passage: "${snippet}"?`,
      options,
      correctAnswer: correct,
      explanation: `Grounded in this excerpt from your notes: "${s}"`,
      sourceTopic: correct,
    });
  }

  const good = questions.filter(validateQuestionQuality);
  return (good.length ? good : questions).slice(0, count);
}

/**
 * Generates answers for a set of questions from Claude's perspective to act as a competitor.
 */
export async function generateClaudeCompetitorAnswers(
  questions: GeneratedQuestion[],
  content: string
): Promise<Record<string, { answer: string; isCorrect: boolean }>> {
  const cleaned = cleanContentForQuiz(content).slice(0, 10000);

  const prompt = `You are competing in a reasoning quiz based ONLY on this study material:
"""
${cleaned}
"""

Questions:
${JSON.stringify(questions.map((q) => ({ id: q.id, question: q.question, options: q.options })))}

Return ONLY JSON:
{ "questionId": { "answer": "exact option string", "isCorrect": true } }`;

  try {
    const text = await callQuizClaude(prompt, 2000);
    return JSON.parse(extractJson(text));
  } catch (error) {
    console.error('[QuizService] Error generating Claude answers (Competitor):', error);
    return {};
  }
}
