/**
 * Local coaching suggestions for "Add to Study Schedule".
 * Uses quiz evidence + existing tasks + summary topic order.
 * All suggested dates are clamped to on/before the exam date.
 */
import type { TopicProgress } from '../types';
import type { RevisionTask, StructuredSummary } from '../types/summary';
import { buildSummaryView, isAcademicTopicName } from './contentClassification';
import { topicEvidence } from './analyticsService';

export interface ScheduleSuggestion {
  date: string;
  durationMinutes: number;
  afterTopic: string | null;
  nextTopic: string | null;
  studyFocus: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  band: 'weak' | 'moderate' | 'strong' | 'unknown';
  altDates: { date: string; label: string }[];
  altDurations: number[];
  /** Inclusive last day that may be scheduled (exam day). */
  latestDate: string | null;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(date: string): Date | null {
  const d = new Date(date + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

/** Clamp a date into [today, exam] (exam inclusive). */
export function clampToExamWindow(date: Date, examDate: string | null, today = startOfDay(new Date())): Date {
  let d = startOfDay(date);
  if (d < today) d = today;
  if (examDate) {
    const exam = parseIso(examDate);
    if (exam) {
      if (today > exam) return today; // exam passed — keep today as fallback
      if (d > exam) d = exam;
    }
  }
  return d;
}

function bandFor(pct: number | null | undefined): ScheduleSuggestion['band'] {
  if (pct == null) return 'unknown';
  if (pct > 75) return 'strong';
  if (pct >= 50) return 'moderate';
  return 'weak';
}

function fuzzyMatchProgress(topic: string, progress: TopicProgress[]): TopicProgress | undefined {
  const t = topic.toLowerCase().trim();
  return (
    progress.find((p) => p.name.toLowerCase() === t) ||
    progress.find((p) => t.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(t))
  );
}

/**
 * How many calendar days remain in the planning window (today → exam inclusive).
 */
export function planningDayCount(daysLeft: number | null, examDate: string | null): number {
  const today = startOfDay(new Date());
  if (examDate) {
    const exam = parseIso(examDate);
    if (exam) {
      const diff = Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(1, diff + 1); // inclusive of exam day
    }
  }
  if (daysLeft == null) return 7;
  if (daysLeft < 0) return 1;
  return Math.max(1, daysLeft + 1);
}

/**
 * Suggest when, roughly how long, and in what order to study `topic`.
 * Never suggests a date after the exam. Durations are estimates the student
 * edits; the reason cites quiz evidence when there is some.
 */
export function suggestSchedulePlacement(opts: {
  topic: string;
  summary: StructuredSummary | null;
  topicProgress: TopicProgress[];
  revisionTasks: RevisionTask[];
  daysLeft: number | null;
  examDate: string | null;
  /** Material the topic comes from, used to name a concrete activity. */
  fileName?: string | null;
}): ScheduleSuggestion {
  const { topic, summary, topicProgress, revisionTasks, daysLeft, examDate, fileName } = opts;
  const today = startOfDay(new Date());
  const exam = examDate ? parseIso(examDate) : null;
  const latestDate = exam ? isoDate(exam) : null;

  const assessed = topicProgress.filter((p) => p.percentage != null);
  const matched = fuzzyMatchProgress(topic, topicProgress);
  const pct = matched?.percentage ?? null;
  const band = bandFor(pct);

  let priority: ScheduleSuggestion['priority'] = 'medium';
  if (band === 'weak') priority = 'high';
  else if (band === 'strong') priority = 'low';
  if (daysLeft != null && daysLeft <= 3 && band !== 'strong') priority = 'high';

  // A starting estimate only; the student sets the real length.
  const durationMinutes = 30;

  // Topic order from the summary (academic topics only).
  const summaryTopics = summary ? buildSummaryView(summary).academicTopics : [];
  const summaryTitles = summaryTopics.map((t) => t.title).filter(Boolean);
  const idx = summaryTitles.findIndex((t) => t.toLowerCase() === topic.toLowerCase());
  const prevFromSummary = idx > 0 ? summaryTitles[idx - 1] : null;
  const nextFromSummary = idx >= 0 && idx < summaryTitles.length - 1 ? summaryTitles[idx + 1] : null;

  const weaker = assessed
    .filter((p) => (p.percentage as number) < (pct ?? 40) && p.name.toLowerCase() !== topic.toLowerCase())
    .sort((a, b) => (a.percentage as number) - (b.percentage as number));

  const afterTopic =
    weaker[0]?.name ||
    prevFromSummary ||
    revisionTasks
      .filter((t) => t.topic.toLowerCase() !== topic.toLowerCase() && isAcademicTopicName(t.topic))
      .slice(-1)[0]?.topic ||
    null;

  const nextTopic =
    nextFromSummary ||
    assessed
      .filter((p) => p.name.toLowerCase() !== topic.toLowerCase())
      .sort((a, b) => (a.percentage as number) - (b.percentage as number))
      .find((p) => (p.percentage as number) >= (pct ?? 0))?.name ||
    null;

  const afterTask = afterTopic
    ? revisionTasks
        .filter((t) => t.topic.toLowerCase() === afterTopic.toLowerCase())
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1)
    : null;

  let suggested = addDays(today, priority === 'high' ? 0 : priority === 'medium' ? 1 : 2);
  if (afterTask?.date) {
    const afterDate = parseIso(afterTask.date);
    if (afterDate) suggested = addDays(afterDate, 1);
  }
  if (daysLeft != null && daysLeft <= 2) suggested = today;
  suggested = clampToExamWindow(suggested, examDate, today);
  const date = isoDate(suggested);

  // Alt dates: only within today → exam (inclusive)
  const windowDays = planningDayCount(daysLeft, examDate);
  const rawAlts: { date: string; label: string }[] = [{ date: isoDate(today), label: 'Today' }];
  if (windowDays > 1) {
    rawAlts.push({ date: isoDate(clampToExamWindow(addDays(today, 1), examDate, today)), label: 'Tomorrow' });
  }
  if (windowDays > 2) {
    rawAlts.push({ date: isoDate(clampToExamWindow(addDays(today, 2), examDate, today)), label: 'In 2 days' });
  }
  if (exam && isoDate(exam) !== isoDate(today)) {
    rawAlts.push({ date: isoDate(exam), label: 'Exam day' });
  }
  const altDates = rawAlts.filter(
    (a, i, arr) => arr.findIndex((x) => x.date === a.date) === i && (!exam || a.date <= isoDate(exam))
  );
  const altDurations = [15, 30, 45, 60];

  // Why: quiz evidence when there is some, otherwise say plainly it's untested.
  const reasonParts: string[] = [];
  if (matched && (matched.answered ?? 0) > 0) {
    reasonParts.push(`Quiz evidence for “${topic}”: ${topicEvidence(matched)}.`);
  } else if (matched && (matched.unanswered ?? 0) > 0) {
    reasonParts.push(`“${topic}” hasn’t been assessed yet: the quiz questions on it were left unanswered.`);
  } else {
    reasonParts.push(`“${topic}” hasn’t been quizzed yet, so this is a first pass rather than a fix for a known gap.`);
  }
  if (afterTopic) reasonParts.push(`Do it after “${afterTopic}”${weaker[0]?.name === afterTopic ? ', which scored lower' : ', which comes first in the material'}.`);
  if (examDate) reasonParts.push(`Placed on or before your exam (${examDate}).`);
  else reasonParts.push('Set an exam date on Exam Prep so plans stop on exam day.');
  if (nextTopic) reasonParts.push(`Then move on to “${nextTopic}”.`);

  // What to do: a concrete activity grounded in the available material.
  const source = summaryTopics.find((t) => t.title.toLowerCase() === topic.toLowerCase());
  const pages = source?.sourcePages?.length ? `page${source.sourcePages.length === 1 ? '' : 's'} ${source.sourcePages.join(', ')}` : null;
  const where = fileName ? (pages ? `${pages} of ${fileName}` : fileName) : pages || 'your notes';
  const hasExample = Boolean(source?.examples?.length);
  const missed = matched ? Math.max(0, (matched.answered ?? 0) - (matched.correct ?? 0)) : 0;
  const studyFocus =
    band === 'weak' || missed > 0
      ? `Re-read ${where} on “${topic}”, write the key ideas from memory, then redo the ${missed > 1 ? `${missed} questions` : 'question'} you missed and check why the right answer is right.`
      : band === 'unknown'
        ? `Read ${where} on “${topic}”, then explain it in your own words${hasExample ? ' and rework the example from the material' : ''} without looking.`
        : `Quick check on “${topic}”: explain it from memory, then compare with ${where}.`;

  return {
    date,
    durationMinutes,
    afterTopic,
    nextTopic,
    studyFocus,
    reason: reasonParts.join(' '),
    priority,
    band,
    altDates,
    altDurations,
    latestDate,
  };
}
