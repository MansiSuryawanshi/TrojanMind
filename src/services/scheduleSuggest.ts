/**
 * Local coaching suggestions for "Add to Study Schedule".
 * Uses readiness colors + existing tasks + summary topic order.
 * All suggested dates are clamped to on/before the exam date.
 */
import type { TopicProgress } from '../types';
import type { RevisionTask, StructuredSummary } from '../types/summary';

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

function bandFor(pct: number | undefined): ScheduleSuggestion['band'] {
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
 * Suggest when/how long/in what order to study `topic`.
 * Never suggests a date after the exam.
 */
export function suggestSchedulePlacement(opts: {
  topic: string;
  summary: StructuredSummary | null;
  topicProgress: TopicProgress[];
  revisionTasks: RevisionTask[];
  daysLeft: number | null;
  examDate: string | null;
}): ScheduleSuggestion {
  const { topic, summary, topicProgress, revisionTasks, daysLeft, examDate } = opts;
  const today = startOfDay(new Date());
  const exam = examDate ? parseIso(examDate) : null;
  const latestDate = exam ? isoDate(exam) : null;

  const matched = fuzzyMatchProgress(topic, topicProgress);
  const band = bandFor(matched?.percentage);
  const pct = matched?.percentage;

  // Duration by color / urgency
  let durationMinutes = 45;
  let priority: ScheduleSuggestion['priority'] = 'medium';
  if (band === 'weak' || (daysLeft != null && daysLeft <= 3)) {
    durationMinutes = 60;
    priority = 'high';
  } else if (band === 'moderate') {
    durationMinutes = 45;
    priority = 'medium';
  } else if (band === 'strong') {
    durationMinutes = 25;
    priority = 'low';
  }

  // Topic order from summary
  const summaryTitles = (summary?.topics || []).map((t) => t.title).filter(Boolean);
  const idx = summaryTitles.findIndex((t) => t.toLowerCase() === topic.toLowerCase());
  const prevFromSummary = idx > 0 ? summaryTitles[idx - 1] : null;
  const nextFromSummary =
    idx >= 0 && idx < summaryTitles.length - 1 ? summaryTitles[idx + 1] : null;

  const weaker = [...topicProgress]
    .filter((p) => p.percentage < (pct ?? 40) && p.name.toLowerCase() !== topic.toLowerCase())
    .sort((a, b) => a.percentage - b.percentage);

  const afterTopic =
    weaker[0]?.name ||
    prevFromSummary ||
    revisionTasks.filter((t) => t.topic.toLowerCase() !== topic.toLowerCase()).slice(-1)[0]
      ?.topic ||
    null;

  const nextTopic =
    nextFromSummary ||
    [...topicProgress]
      .filter((p) => p.name.toLowerCase() !== topic.toLowerCase())
      .sort((a, b) => a.percentage - b.percentage)
      .find((p) => p.percentage >= (pct ?? 0))?.name ||
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

  if (daysLeft != null && daysLeft <= 2) {
    suggested = today;
    durationMinutes = Math.max(durationMinutes, 50);
  }

  suggested = clampToExamWindow(suggested, examDate, today);

  const date = isoDate(suggested);

  // Alt dates: only within today → exam (inclusive)
  const windowDays = planningDayCount(daysLeft, examDate);
  const rawAlts: { date: string; label: string }[] = [
    { date: isoDate(today), label: 'Today' },
  ];
  if (windowDays > 1) {
    rawAlts.push({ date: isoDate(clampToExamWindow(addDays(today, 1), examDate, today)), label: 'Tomorrow' });
  }
  if (windowDays > 2) {
    rawAlts.push({
      date: isoDate(clampToExamWindow(addDays(today, 2), examDate, today)),
      label: 'In 2 days',
    });
  }
  if (exam && isoDate(exam) !== isoDate(today)) {
    rawAlts.push({ date: isoDate(exam), label: 'Exam day' });
  }

  const altDates = rawAlts.filter(
    (a, i, arr) =>
      arr.findIndex((x) => x.date === a.date) === i &&
      (!exam || a.date <= isoDate(exam))
  );

  const altDurations = [...new Set([25, 45, 60, 90, durationMinutes])].sort((a, b) => a - b);

  const bandLabel =
    band === 'weak'
      ? `red / weak${pct != null ? ` (${pct}%)` : ''}`
      : band === 'moderate'
        ? `amber / moderate${pct != null ? ` (${pct}%)` : ''}`
        : band === 'strong'
          ? `green / strong${pct != null ? ` (${pct}%)` : ''}`
          : 'not yet scored';

  const reasonParts: string[] = [];
  if (afterTopic) {
    reasonParts.push(`Do this after “${afterTopic}” so prerequisites / weaker gaps come first.`);
  } else {
    reasonParts.push('No prior topic required — you can open with this block.');
  }
  reasonParts.push(`Suggested ${durationMinutes} min because coverage is ${bandLabel}.`);
  if (examDate) {
    reasonParts.push(`Scheduled on/before your exam (${examDate}) — nothing after exam day.`);
  } else if (daysLeft != null) {
    reasonParts.push(
      daysLeft <= 3
        ? `Only ${daysLeft} day(s) to exam — schedule sooner and longer.`
        : `${daysLeft} days to exam — keep red → amber → green order.`
    );
  } else {
    reasonParts.push('Set an exam date on Exam Prep so plans stay inside the exam window.');
  }
  if (nextTopic) {
    reasonParts.push(`After this, move to “${nextTopic}”.`);
  }

  const studyFocus =
    band === 'weak'
      ? `Rebuild foundations for “${topic}”: definitions, procedures, then 3 practice questions.`
      : band === 'moderate'
        ? `Strengthen “${topic}”: revisit notes, one online article, then a short self-quiz.`
        : `Quick maintain “${topic}”: 10-min recall + one stretch question, then return to red gaps.`;

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
