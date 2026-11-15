/**
 * Claude API Service Layer — all Claude API calls live here.
 * Owner: Developer 2 (Claude API Service)
 */
import type { ScheduleResponse, FollowUpResult, DefenseEvaluation } from '../types';
import type { ScoreResult } from '../types/index';
import type { StudySnapshot, GeneratedReport } from '../types/report';

import { AI_ENDPOINT as CLAUDE_URL, aiFetch } from './aiClient';
import { ANTHROPIC_MODEL } from '../config/aiConfig';
import { isAdministrativeLabel } from './contentClassification';

/** Per-topic quiz evidence passed to the schedule generator. */
export interface TopicAccuracyInput {
  topic: string;
  accuracy: number;
  /** e.g. "1 of 4 answered questions correct (latest quiz: Nov 14)". */
  evidence?: string;
}


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

function extractJson(text: string | undefined | null): string {
  if (text == null || typeof text !== 'string') {
    throw new Error('Claude returned empty content (no text to parse).');
  }
  // Strip markdown fences (handles ```json, ```, multiline)
  let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, '$1').trim();
  // If no fences were found, use original text
  if (cleaned === text.trim()) cleaned = text.trim();
  // If still doesn't start with { or [, pull out the first JSON block
  if (cleaned[0] !== '{' && cleaned[0] !== '[') {
    const m = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) cleaned = m[1];
  }
  return cleaned;
}

/** Turn off up-front thinking so JSON fits in max_tokens on Sonnet 5.5. */
function structuredExtras() {
  const isSonnet55 = /sonnet-5-5/i.test(ANTHROPIC_MODEL);
  return {
    thinking: { type: isSonnet55 ? 'between_tools' : 'disabled' },
    output_config: { effort: 'low' },
  };
}

// ── scoreAnswers ─────────────────────────────────────────────────────────────
export async function scoreAnswers(
  question: string,
  answerA: string,
  answerB: string
): Promise<ScoreResult> {
  const prompt =
    'You are an expert educational assessor. Two students answered the same question.\n\n' +
    'Question: ' + question + '\n' +
    'Student A answer: ' + answerA + '\n' +
    'Student B answer: ' + answerB + '\n\n' +
    'Return ONLY valid JSON, no extra text, no markdown:\n' +
    '{\n' +
    '  "student_a": { "correctness": 0-10, "reasoning_depth": 0-10, "clarity": 0-10, "total": 0-100, "misconception_present": true, "misconception_name": null, "concept_gap": null },\n' +
    '  "student_b": { "correctness": 0-10, "reasoning_depth": 0-10, "clarity": 0-10, "total": 0-100, "misconception_present": true, "misconception_name": null, "concept_gap": null },\n' +
    '  "depth_insight": "one sentence",\n' +
    '  "same_answer_different_depth": true,\n' +
    '  "winner": "A"\n' +
    '}';

  console.log(`Using Anthropic model: ${ANTHROPIC_MODEL}`);
  const response = await aiFetch(CLAUDE_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,

      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return JSON.parse(extractJson(messageText(data))) as ScoreResult;
}

/**
 * Evaluates a descriptive (short answer) question semantically.
 * Returns whether the answer is correct and provides feedback.
 */
export async function evaluateShortAnswer(
  question: string,
  userAnswer: string,
  expectedAnswer: string,
  explanation?: string
): Promise<{ isCorrect: boolean; feedback: string }> {
  // 1. Simple normalization for minimal variation
  const normUser = userAnswer.trim().toLowerCase();
  const normExpected = expectedAnswer.trim().toLowerCase();
  
  if (normUser === normExpected) {
    return { isCorrect: true, feedback: "Exact match!" };
  }

  // 2. Perform semantic evaluation with Claude
  const prompt = `You are an educational grader. 
Question: "${question}"
User's Answer: "${userAnswer}"
Correct/Expected Answer: "${expectedAnswer}"
Reference Explanation: "${explanation || 'N/A'}"

Evaluate if the user's answer is semantically correct and covers the core concepts, even if worded differently.
Respond ONLY with a JSON object: 
{"isCorrect": true/false, "feedback": "one short sentence explaining why"}

Strictness: If the answer is factually correct but uses synonyms or phrasing changes, mark it TRUE. If it misses the core point or is factually wrong, mark it FALSE.`;

  console.log(`[Claude] Descriptive answer evaluation started...`);
  try {
    const response = await aiFetch(CLAUDE_URL, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error("API call failed");

    const data = await response.json();
    const result = JSON.parse(extractJson(messageText(data))) as { isCorrect: boolean; feedback: string };
    console.log(`[Claude] Evaluation result: ${result.isCorrect ? 'CORRECT' : 'INCORRECT'}`);
    return result;
  } catch (error) {
    console.error("[Claude] Semantic evaluation failed. Falling back to fuzzy matching.", error);
    // Rough fallback: if user answer contains most of the expected answer words
    const points = expectedAnswer.toLowerCase().split(' ').filter(w => w.length > 3);
    const matches = points.filter(p => normUser.includes(p));
    const isCorrect = matches.length >= Math.ceil(points.length * 0.6);
    return { isCorrect, feedback: isCorrect ? "Fuzzy match success." : "Does not match core requirements." };
  }
}

// ── generateFollowUp ─────────────────────────────────────────────────────────
export const generateFollowUp = async (
  question: string,
  pastAnswer: string,
  depthScore: number,
): Promise<FollowUpResult> => {
  const q = (question || '').trim() || 'Explain this topic in your own words.';
  const a = (pastAnswer || '').trim() || 'I am still building my understanding of this topic.';
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    ...structuredExtras(),
    messages: [{
      role: 'user' as const,
      content: `You are a Socratic examiner. A student answered:\n\nQuestion: ${q}\nAnswer: ${a}\nDepth score: ${depthScore}/10\n\nGenerate a probing follow-up targeting their weakest point. Respond ONLY with JSON:\n{"followup_question":"...","weak_point_targeted":"...","deep_answer_covers":["...","...","..."],"score_if_passed":${Math.min(depthScore + 1.5, 10)},"score_if_failed":${Math.max(depthScore - 2, 0)}}`,
    }],
  };

  let res = await aiFetch(CLAUDE_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  // Retry without thinking extras if the model rejects them
  if (!res.ok && res.status === 400) {
    const { thinking: _t, output_config: _o, ...bare } = body as typeof body & {
      thinking?: unknown;
      output_config?: unknown;
    };
    res = await aiFetch(CLAUDE_URL, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(bare),
    });
  }

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return JSON.parse(extractJson(messageText(data))) as FollowUpResult;
};

// ── detectMisconception ──────────────────────────────────────────────────────
export const detectMisconception = async (_question: string, _answer: string) => {
  // Implementation
};

// ── calibrateConfidence ──────────────────────────────────────────────────────
export const calibrateConfidence = async (
  _question: string,
  _answer: string,
  _confidenceRating: number,
  _depthScore: number,
) => {
  // Implementation
};

// ── generateQuestion ─────────────────────────────────────────────────────────
export const generateQuestion = async (_topic: string) => {
  // Implementation
};

function searchArticleUrl(topic: string): string {
  const q = encodeURIComponent(`${topic} explained site:.edu OR tutorial OR guide`);
  return `https://www.google.com/search?q=${q}`;
}

function scholarUrl(topic: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(topic)}`;
}

function isoFromOffset(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatScheduleDayLabel(iso: string, offset: number): string {
  const d = new Date(iso + 'T12:00:00');
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const pretty = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (offset === 0) return `Today · ${weekday} · ${pretty}`;
  if (offset === 1) return `Tomorrow · ${weekday} · ${pretty}`;
  return `${weekday} · ${pretty}`;
}

function looksLikeIsoDate(value?: string | null): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function normalizeScheduleSessions(
  plan: ScheduleResponse,
  gaps: string[],
  uploadedMaterials: string[],
  daysToExam = 7
): ScheduleResponse {
  const priority = plan.priority_gap || gaps[0] || 'General review';
  const maxOffset = Math.max(0, Math.min(5, Math.floor(daysToExam)) );

  return {
    ...plan,
    priority_gap: priority,
    schedule: (plan.schedule || []).map((day, index) => {
      const offset = Math.min(index, maxOffset);
      const date = looksLikeIsoDate(day.date) ? day.date! : isoFromOffset(offset);
      const dayLabel =
        day.day && /\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(day.day)
          ? day.day
          : formatScheduleDayLabel(date, offset);

      return {
        ...day,
        date,
        day: dayLabel,
        // Course policies are never academic study sessions.
        sessions: (day.sessions || [])
          .filter((s) => !isAdministrativeLabel(s.targets_gap) && !isAdministrativeLabel(s.label))
          .map((s) => {
          const topic = s.targets_gap || s.topic_tag || priority;
          const resources = Array.isArray(s.resources) ? [...s.resources] : [];
          const hasArticle = resources.some((r) => r.type === 'article' || /http/i.test(r.url || ''));
          if (!hasArticle) {
            resources.push({
              title: `Find online articles: ${topic}`,
              url: searchArticleUrl(topic),
              type: 'article',
              why: 'Open reputable explainers and course notes for this topic.',
            });
            resources.push({
              title: `Scholar results: ${topic}`,
              url: scholarUrl(topic),
              type: 'article',
              why: 'Peer-reviewed / academic sources for deeper reading.',
            });
          }
          if (
            uploadedMaterials.length > 0 &&
            !resources.some((r) => r.type === 'uploaded_material')
          ) {
            resources.push({
              title: uploadedMaterials[0],
              url: '',
              type: 'uploaded_material',
              why: 'Re-read the matching section in your uploaded notes/PDF for this topic.',
            });
          }
          return {
            ...s,
            what_to_study:
              s.what_to_study?.trim() ||
              `Re-read the part of your notes on "${topic}", then explain it without looking and check what you missed.`,
            study_steps:
              s.study_steps && s.study_steps.length
                ? s.study_steps
                : [
                    `Skim your notes for "${topic}" and list 3 key claims.`,
                    'Read one solid online article or tutorial on the same idea.',
                    'Write a 5-sentence explanation without looking, then check accuracy.',
                    'Do 3-5 practice questions (Challenge or flashcards) on this topic.',
                  ],
            resources,
          };
        }),
      };
    }),
  };
}

// ── generateSchedule ─────────────────────────────────────────────────────────
export const generateSchedule = async (
  gaps: string[],
  avgScore: number,
  daysToExam: number = 7,
  topicAccuracy?: TopicAccuracyInput[],
  uploadedMaterials: string[] = [],
  attemptCount = 0,
): Promise<ScheduleResponse> => {

  // Build per-topic accuracy context so Claude allocates more time to weak topics
  const topicContext = topicAccuracy && topicAccuracy.length > 0
    ? `\nPer-topic quiz results (academic topics only, weakest first):\n${topicAccuracy
        .sort((a, b) => a.accuracy - b.accuracy)
        .map(t => `  - ${t.topic}: ${t.evidence || `${t.accuracy}% of answered questions correct`}`)
        .join('\n')}`
    : '';

  const materialsContext = uploadedMaterials.length
    ? `\nStudent uploaded materials (reference by filename when relevant):\n${uploadedMaterials
        .slice(0, 8)
        .map((m) => `  - ${m}`)
        .join('\n')}`
    : '';

  const prompt = `You are an adaptive learning coach for college students.

The student missed questions on these academic topics in their quizzes:
Topics to review (weakest first): ${JSON.stringify(gaps)}
Average quiz score: ${avgScore}% across ${attemptCount} quiz${attemptCount === 1 ? '' : 'zes'}${attemptCount < 3 ? ' (early results: too few quizzes to call it a trend; do not describe the student as weak or strong overall)' : ''}
Days until exam: ${daysToExam}${topicContext}${materialsContext}

PLANNING WINDOW (HARD RULE):
- Days until exam: ${daysToExam}. You may schedule ONLY within this window (today through exam day inclusive).
- NEVER invent days after the exam. If daysToExam is 0 or 1, return ONLY a 1-day plan. If 2, return at most 2 days. Cap at 5 days even if more remain.

ADAPTIVE STRATEGY BASED ON DAYS LEFT (${daysToExam}):
- 0-3 days (URGENT): "Sprint Mode". Focus ONLY on the most critical weak areas. Shorter, high-intensity sessions. Rationale should mention "Critical window".
- 4-10 days (TIGHT): "Gap Closure Mode". Heavy focus on weak areas, but include 1-2 review sessions for strong topics.
- 11+ days (BALANCED): "Spaced review". Evenly spread sessions, deep dives into complex topics, and spaced repetition.

IMPORTANT RULES:
- Plan ONLY the academic topics listed above. Never create sessions about course administration (deadlines, grading, attendance, submission or communication policies).
- Topics with lower accuracy get more sessions. "duration" is a rough estimate the student will edit: default to "30 min", and never justify or explain the duration.
- A quiz score is practice evidence, not a measure of overall understanding or mastery. Don't call topics "mastered".
- Use badge_type "coral" for gap topics, "purple" for challenge/practice, "teal" for review
- For EACH session provide:
  - label: name the concept being studied (e.g. "Review: Binary search trees")
  - rationale: why it is recommended, citing the quiz evidence above (e.g. "You got 1 of 4 questions on this right in your Nov 14 quiz")
  - what_to_study: 1–3 sentences naming a CONCRETE activity using the uploaded materials (re-read a section, redo missed questions, rework an example) — not vague advice
  - study_steps: 3–5 ordered actionable steps for the session
  - resources: 2–4 study sources. MUST include at least one online article (type "article") with a real https URL (prefer well-known educational sites, .edu pages, official docs, or a Google/Scholar search URL for the topic). Also include uploaded_material when filenames are provided. Types: article | video | docs | uploaded_material | practice | other.
- Never invent fake journal DOIs. Prefer real sites (MDN, Khan Academy, official docs, university pages) OR search URLs.

Generate a study schedule with at most ${Math.min(5, Math.max(1, daysToExam + 1))} day(s) ending on/before the exam. Each day MUST include a real calendar "date" as YYYY-MM-DD starting from today. Return ONLY a raw JSON object, no markdown, no backticks, no explanation:
{"schedule":[{"day":"Today · Monday","date":"YYYY-MM-DD","sessions":[{"time":"9:00 am","label":"session name","topic_tag":"gap focus","duration":"45 min","badge_type":"coral","targets_gap":"gap name or null","rationale":"short evidence string","what_to_study":"concrete focus","study_steps":["step 1","step 2","step 3"],"resources":[{"title":"Article title","url":"https://...","type":"article","why":"why this helps"}]}]}],"priority_gap":"most urgent gap","readiness_message":"one sentence"}`;

  try {
    console.log(`[ClaudeService] Generating schedule with ${ANTHROPIC_MODEL}...`);
    const body: Record<string, unknown> = {
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      ...structuredExtras(),
      messages: [{ role: 'user', content: prompt }],
    };

    let response = await aiFetch(CLAUDE_URL, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok && response.status === 400) {
      const { thinking: _t, output_config: _o, ...bare } = body;
      response = await aiFetch(CLAUDE_URL, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(bare),
      });
    }

    if (!response.ok) {
      console.warn(`[ClaudeService] API Error ${response.status}. Falling back to local...`);
      return normalizeScheduleSessions(
        buildMockSchedule(gaps, avgScore, daysToExam, topicAccuracy, uploadedMaterials),
        gaps,
        uploadedMaterials,
        daysToExam
      );
    }

    const data = await response.json();
    const parsed = JSON.parse(extractJson(messageText(data))) as ScheduleResponse;
    return normalizeScheduleSessions(
      { ...parsed, isFallback: false },
      gaps,
      uploadedMaterials,
      daysToExam
    );

  } catch (err) {
    console.group("[ClaudeService-FAIL] Generation error");
    console.error(err);
    console.log("Triggering local fallback generator...");
    console.groupEnd();
    return normalizeScheduleSessions(
      buildMockSchedule(gaps, avgScore, daysToExam, topicAccuracy, uploadedMaterials),
      gaps,
      uploadedMaterials,
      daysToExam
    );
  }
};

// ── generateReport ───────────────────────────────────────────────────────────
export const generateReport = async (snapshot: StudySnapshot): Promise<GeneratedReport> => {

  const avgScore =
    snapshot.quizSessions.length === 0
      ? 0
      : Math.round(snapshot.quizSessions.reduce((s, q) => s + q.scoreA, 0) / snapshot.quizSessions.length);

  const adherencePct =
    snapshot.scheduleAdherence.sessionsPlanned === 0
      ? 0
      : Math.round((snapshot.scheduleAdherence.sessionsCompleted / snapshot.scheduleAdherence.sessionsPlanned) * 100);

  const userPrompt = `Generate a comprehensive study performance report based on this data:

QUIZ PERFORMANCE:
Sessions completed: ${snapshot.quizSessions.length}
Average score: ${avgScore}/100
Concept gaps detected: ${snapshot.quizSessions.flatMap((q) => q.conceptGaps).join(', ') || 'None'}
Misconceptions identified: ${snapshot.quizSessions.flatMap((q) => q.misconceptions).join(', ') || 'None'}
Depth insights: ${snapshot.quizSessions.map((q) => q.depthInsight).join('; ') || 'Not yet assessed'}

STUDY SCHEDULE:
Sessions planned: ${snapshot.scheduleAdherence.sessionsPlanned}
Sessions completed: ${snapshot.scheduleAdherence.sessionsCompleted}
Adherence rate: ${adherencePct}%
Priority gap being targeted: ${snapshot.scheduleAdherence.priorityGap}

EXAM READINESS:
Overall readiness score: ${snapshot.examReadiness.overallScore}/100
Topic coverage: ${JSON.stringify(snapshot.examReadiness.topicCoverage)}
Weak areas: ${snapshot.examReadiness.weakAreas.join(', ') || 'None identified'}
Cross-examinations passed: ${snapshot.examReadiness.crossExamsPassed}
Cross-examinations failed: ${snapshot.examReadiness.crossExamsFailed}

Interpretation rules:
- A quiz score is practice evidence, not a measure of overall understanding or mastery.
- With fewer than 3 quiz sessions, describe results as early practice results and say more practice is needed to see a reliable trend.
- Base every finding on the data above. Don't invent misconceptions, reasoning depth, or topics that aren't listed.
- Ignore course-administration topics (deadlines, grading, attendance policies) when discussing what to study.

Return this exact JSON structure:
{
  "overallScore": 62,
  "topStrength": "one sentence",
  "topWeakness": "one sentence",
  "sections": [
    { "title": "Reasoning Quality", "score": 58, "summary": "2-3 sentences", "keyFindings": ["f1","f2","f3"], "recommendation": "one step" },
    { "title": "Study Consistency", "score": 65, "summary": "2-3 sentences", "keyFindings": ["f1","f2"], "recommendation": "one step" },
    { "title": "Exam Readiness", "score": 55, "summary": "2-3 sentences", "keyFindings": ["f1","f2","f3"], "recommendation": "one step" },
    { "title": "Concept Mastery", "score": 60, "summary": "2-3 sentences", "keyFindings": ["f1","f2"], "recommendation": "one step" }
  ],
  "actionPlan": ["Immediate action (next 24 hours): step", "This week: step", "Before exam: step"],
  "predictedExamScore": 64,
  "confidenceCalibration": "well-calibrated"
}`;


  console.log(`Using Anthropic model: ${ANTHROPIC_MODEL}`);
  const response = await aiFetch(CLAUDE_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,

      max_tokens: 2048,
      system: 'You are an expert academic performance analyst. Return ONLY valid JSON, no markdown, no backticks.',
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  // Same as the old "no API key" path: the backend has no ANTHROPIC_API_KEY configured.
  if (response.status === 503) return buildMockReport(snapshot);
  if (!response.ok) {
    throw new Error(`Claude API error ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as { content: { text: string }[] };
  try {
    return JSON.parse(extractJson(data.content[0].text)) as GeneratedReport;
  } catch {
    throw new Error('Claude returned invalid JSON for the report. Try again.');
  }
};

// ── Mock fallbacks ────────────────────────────────────────────────────────────
function buildMockSchedule(
  gaps: string[],
  _avgScore: number,
  daysToExam: number,
  topicAccuracy?: TopicAccuracyInput[],
  uploadedMaterials: string[] = []
): ScheduleResponse {
  const evidenceFor = (topic: string) => {
    const hit = topicAccuracy?.find((t) => t.topic === topic);
    return hit?.evidence ? `From your quizzes: ${hit.evidence}.` : `You missed questions on “${topic}” in a recent quiz.`;
  };
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDate = new Date();
  // Inclusive window: today through exam day. Cap display days at 5.
  const windowDays = Math.min(5, Math.max(1, Math.floor(daysToExam) + 1));
  
  const dateForOffset = (offset: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(todayDate.getDate() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayNum}`;
  };

  const labelForOffset = (offset: number) => {
    const iso = dateForOffset(offset);
    const d = new Date(iso + 'T12:00:00');
    const name = dayNames[d.getDay()];
    const pretty = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (offset === 0) return `Today · ${name} · ${pretty}`;
    if (offset === 1) return `Tomorrow · ${name} · ${pretty}`;
    if (offset === windowDays - 1 && daysToExam >= 0) return `Exam eve/day · ${name} · ${pretty}`;
    return `${name} · ${pretty}`;
  };

  const priorityGap = gaps[0] ?? 'General review';
  const upload = uploadedMaterials[0];
  
  // Sort topics by accuracy to prioritize weakest
  const sortedTopics = topicAccuracy 
    ? [...topicAccuracy].sort((a, b) => a.accuracy - b.accuracy)
    : gaps.map(g => ({ topic: g, accuracy: 50 }));

  const second = sortedTopics[1]?.topic ?? gaps[1] ?? priorityGap;

  const detailFor = (topic: string) => ({
    what_to_study: `Focus on definitions, procedures, and common exam traps for "${topic}". Connect the idea back to examples from class.`,
    study_steps: [
      `Open your notes and highlight every definition related to ${topic}.`,
      'Read one solid online article or .edu explainer on the same topic.',
      'Summarize the article + notes in 5 bullets from memory.',
      'Answer 3 practice questions, then correct mistakes immediately.',
    ],
    resources: [
      {
        title: `Online articles about ${topic}`,
        url: searchArticleUrl(topic),
        type: 'article' as const,
        why: 'Browse reputable tutorials and course pages for clearer explanations.',
      },
      {
        title: `Google Scholar: ${topic}`,
        url: scholarUrl(topic),
        type: 'article' as const,
        why: 'Academic papers and lecture notes for deeper grounding.',
      },
      ...(upload
        ? [
            {
              title: upload,
              url: '',
              type: 'uploaded_material' as const,
              why: `Locate the ${topic} section in this upload and re-read it carefully.`,
            },
          ]
        : []),
      {
        title: 'TrojanMind Challenge / flashcards',
        url: '',
        type: 'practice' as const,
        why: 'Active recall on this topic after reading.',
      },
    ],
  });

  type DayBlock = ScheduleResponse['schedule'][number];
  const schedule: DayBlock[] = [];

  // Day 0 — always (today)
  schedule.push({
    day: labelForOffset(0),
    date: dateForOffset(0),
    sessions: [
      {
        time: '9:00 am',
        label: `Review: ${priorityGap}`,
        topic_tag: 'Gap Focus',
        duration: '30 min',
        badge_type: 'coral',
        targets_gap: priorityGap,
        rationale: evidenceFor(priorityGap),
        ...detailFor(priorityGap),
      },
      ...(windowDays === 1
        ? [
            {
              time: '2:00 pm',
              label: 'Exam-day rapid review',
              topic_tag: 'Sprint',
              duration: '30 min',
              badge_type: 'purple' as const,
              targets_gap: second,
              rationale: 'Only one day left — compress secondary gaps into a short block.',
              ...detailFor(second),
            },
          ]
        : [
            {
              time: '2:00 pm',
              label: 'Mixed Practice + Article Check',
              topic_tag: 'active recall',
              duration: '30 min',
              badge_type: 'purple' as const,
              targets_gap: null,
              rationale: 'Broad reinforcement across all current topics.',
              what_to_study: `Quick rotation across weak topics (${gaps.slice(0, 3).join(', ') || 'course core'}), confirming each with one external article.`,
              study_steps: [
                'Pick 2 weak topics from your last quiz.',
                'Skim one article each, then close the tab.',
                'Write one exam-style short answer per topic.',
              ],
              resources: [
                {
                  title: 'Mixed topic article search',
                  url: searchArticleUrl(gaps.slice(0, 2).join(' ')),
                  type: 'article' as const,
                  why: 'Find short explainers for today’s weak spots.',
                },
              ],
            },
          ]),
    ],
  });

  if (windowDays >= 2) {
    schedule.push({
      day: labelForOffset(1),
      date: dateForOffset(1),
      sessions: [
        {
          time: '10:00 am',
          label: `Review: ${second}`,
          topic_tag: 'Weak Topic',
          duration: '30 min',
          badge_type: 'coral',
          targets_gap: second,
          rationale: evidenceFor(second),
          ...detailFor(second),
        },
        {
          time: '4:00 pm',
          label: windowDays === 2 ? 'Pre-exam simulation' : 'Exam Prep Simulation',
          topic_tag: 'Mock Exam',
          duration: '30 min',
          badge_type: 'purple',
          targets_gap: null,
          rationale: 'A timed practice run on the topics you missed, before the exam.',
          what_to_study: `Timed practice covering ${priorityGap} and ${second}; review wrong answers with a source article.`,
          study_steps: [
            'Run a short timed quiz without notes.',
            'For each miss, open one article or your upload section.',
            'Rewrite the correct answer in your own words.',
          ],
          resources: [
            {
              title: `Review articles: ${priorityGap}`,
              url: searchArticleUrl(priorityGap),
              type: 'article',
              why: 'Use after the mock to patch the biggest misses.',
            },
          ],
        },
      ],
    });
  }

  if (windowDays >= 3) {
    schedule.push({
      day: labelForOffset(2),
      date: dateForOffset(2),
      sessions: [
        {
          time: '9:30 am',
          label: `Revisit: ${priorityGap}`,
          topic_tag: 'Spaced Repetition',
          duration: '30 min',
          badge_type: 'teal',
          targets_gap: priorityGap,
          rationale: `A second pass a couple of days later helps it stick. ${evidenceFor(priorityGap)}`,
          ...detailFor(priorityGap),
        },
      ],
    });
  }

  // Extra mid-window days if we have 4–5 days left
  for (let offset = 3; offset < windowDays; offset++) {
    const topic = sortedTopics[offset % Math.max(sortedTopics.length, 1)]?.topic ?? priorityGap;
    schedule.push({
      day: labelForOffset(offset),
      date: dateForOffset(offset),
      sessions: [
        {
          time: '10:00 am',
          label: `Review: ${topic}`,
          topic_tag: 'Within exam window',
          duration: '30 min',
          badge_type: offset === windowDays - 1 ? 'teal' : 'coral',
          targets_gap: topic,
          rationale: evidenceFor(topic),
          ...detailFor(topic),
        },
      ],
    });
  }

  return {
    isFallback: true,
    priority_gap: priorityGap,
    readiness_message:
      daysToExam < 4
        ? `A ${windowDays}-day plan that ends on or before your exam. Adjust the time estimates to fit your day.`
        : `A ${windowDays}-day plan that ends on or before your exam. Adjust the time estimates to fit your day.`,
    schedule,
  };
}

function buildMockReport(snapshot: StudySnapshot): GeneratedReport {
  const sessions = snapshot.quizSessions.length;
  const avg = sessions ? Math.round(snapshot.quizSessions.reduce((s, q) => s + q.scoreA, 0) / sessions) : 0;
  const gaps = [...new Set(snapshot.quizSessions.flatMap((q) => q.conceptGaps))].filter((g) => !isAdministrativeLabel(g));
  const early = sessions < 3;
  const scoreLine = `Average quiz score: ${avg}% across ${sessions} quiz${sessions === 1 ? '' : 'zes'}.`;
  const trendLine = early
    ? 'These are early practice results; take a few more quizzes to see a reliable trend.'
    : 'Compare recent quizzes with earlier ones to see which topics are improving.';
  return {
    overallScore: avg,
    topStrength: early ? 'Too early to name a strength from quiz data.' : 'See the per-topic results for topics you answer correctly.',
    topWeakness: gaps.length ? `Questions on “${gaps[0]}” were missed most recently.` : 'No missed academic topics recorded yet.',
    sections: [
      { title: 'Quiz results', score: avg, summary: `${scoreLine} ${trendLine}`, keyFindings: [scoreLine], recommendation: 'Take another quiz on the same material to confirm these results.' },
      { title: 'Topics to review', score: avg, summary: gaps.length ? `Missed questions came from: ${gaps.slice(0, 5).join(', ')}.` : 'No academic topics with missed questions yet.', keyFindings: gaps.slice(0, 3), recommendation: gaps.length ? `Re-read your notes on “${gaps[0]}” and redo the questions you missed.` : 'Keep practicing with lecture material.' },
      { title: 'Study schedule', score: 0, summary: `${snapshot.scheduleAdherence.sessionsPlanned} session(s) planned.`, keyFindings: [], recommendation: 'Adjust the planned sessions to the time you actually have.' },
    ],
    actionPlan: gaps.length
      ? [`Next: review “${gaps[0]}” using your uploaded notes`, 'Then: retake a short quiz on that material', 'Before the exam: revisit any topic you missed twice']
      : ['Next: take a quiz on your lecture material', 'Then: review any questions you miss', 'Before the exam: revisit missed topics'],
    predictedExamScore: avg,
    confidenceCalibration: 'well-calibrated',
  };
}

// ── evaluateDefense ───────────────────────────────────────────────────────────
export const evaluateDefense = async (
  question: string,
  _pastAnswer: string,
  followUpQuestion: string,
  defenseAnswer: string,
  deepAnswerCovers: string[],
): Promise<DefenseEvaluation> => {
  const covers = Array.isArray(deepAnswerCovers) ? deepAnswerCovers : [];
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    ...structuredExtras(),
    messages: [{
      role: 'user' as const,
      content: `Evaluate this student's defense.\n\nOriginal question: ${question}\nFollow-up: ${followUpQuestion}\nDefense: ${defenseAnswer}\nExpected coverage: ${covers.join(', ')}\n\nRespond ONLY with JSON:\n{"passed":true,"strength":"strong","what_they_got_right":"...or null","what_they_missed":"...or null","verdict_label":"Gap closed"}`,
    }],
  };

  let res = await aiFetch(CLAUDE_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok && res.status === 400) {
    const { thinking: _t, output_config: _o, ...bare } = body as typeof body & {
      thinking?: unknown;
      output_config?: unknown;
    };
    res = await aiFetch(CLAUDE_URL, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(bare),
    });
  }

  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return JSON.parse(extractJson(messageText(data))) as DefenseEvaluation;
};
