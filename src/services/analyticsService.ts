import type { QuizAttempt, TopicProgress } from '../types';
import { isAcademicTopicName, isAdministrativeLabel } from './contentClassification';

export interface MistakeDetail {
  question: string;
  userAnswer: string;
  correctAnswer: string;
  feedback?: string | null;
  topic: string;
  unanswered: boolean;
}

export interface TopicStat {
  name: string;
  /** Questions on this topic across all attempts. */
  total: number;
  /** Questions the student actually answered. */
  answered: number;
  correct: number;
  /** Answered but wrong. */
  incorrect: number;
  /** No answer given (time ran out / left blank). */
  unanswered: number;
  /** correct / answered, or null when nothing was answered ("Not assessed"). */
  accuracy: number | null;
  isCoursePolicy: boolean;
  /** Placeholder topics such as "General". */
  isGeneric: boolean;
  mistakes: MistakeDetail[];
  lastAttemptId: string | null;
  lastAttemptLabel: string | null;
  lastAttemptCorrect: number;
  lastAttemptAnswered: number;
}

export interface AnalyticsSummary {
  topicStats: TopicStat[];
  /** Assessed academic topics with accuracy below 70%. */
  weakTopics: string[];
  strongTopics: string[];
  /** Plain average of recorded quiz scores (genuine zeros included). */
  avgQuizScore: number;
  /** @deprecated kept for callers that still read it; equals avgQuizScore. */
  readinessScore: number;
  avgAccuracy: number;
  totalQuizzes: number;
  totalAnswered: number;
  totalUnanswered: number;
  /** Too few attempts to call it a trend. */
  isEarlyResult: boolean;
  mistakeVault: Record<string, MistakeDetail[]>;
}

/** Attempts needed before results are described as a trend. */
export const RELIABLE_TREND_ATTEMPTS = 3;

/** Older attempts don't store `unanswered`; infer it from the recorded answer. */
export function isUnansweredResult(r: { userAnswer?: string | null; unanswered?: boolean }): boolean {
  if (r.unanswered) return true;
  const a = (r.userAnswer ?? '').trim();
  return !a || a === 'TIME_OUT' || a === '(blank)';
}

export function attemptDateLabel(createdAt: unknown): string | null {
  let d: Date | null = null;
  if (createdAt instanceof Date) d = createdAt;
  else if (createdAt && typeof createdAt === 'object') {
    const ts = createdAt as { seconds?: number; toDate?: () => Date };
    if (typeof ts.toDate === 'function') d = ts.toDate();
    else if (typeof ts.seconds === 'number') d = new Date(ts.seconds * 1000);
  } else if (typeof createdAt === 'string' || typeof createdAt === 'number') d = new Date(createdAt);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Derives performance analytics from saved quiz attempts without changing
 * them. Scores are reported as recorded; interpretation (weak topics,
 * "not assessed") is computed here so older attempts benefit too.
 */
export function deriveStudentAnalytics(attempts: QuizAttempt[]): AnalyticsSummary {
  if (attempts.length === 0) {
    return {
      topicStats: [],
      weakTopics: [],
      strongTopics: [],
      avgQuizScore: 0,
      readinessScore: 0,
      avgAccuracy: 0,
      totalQuizzes: 0,
      totalAnswered: 0,
      totalUnanswered: 0,
      isEarlyResult: true,
      mistakeVault: {},
    };
  }

  const topicMap = new Map<string, TopicStat>();
  let totalAnswered = 0;
  let totalUnanswered = 0;

  // Attempts arrive newest first, so the first attempt that mentions a topic is its latest.
  const latestIndex = new Map<string, number>();
  attempts.forEach((attempt, attemptIndex) => {
    const label = attemptDateLabel(attempt.createdAt);
    (attempt.questionResults || []).forEach((res) => {
      const topicName = (res.topic || 'General').trim() || 'General';
      const entry: TopicStat = topicMap.get(topicName) || {
        name: topicName,
        total: 0,
        answered: 0,
        correct: 0,
        incorrect: 0,
        unanswered: 0,
        accuracy: null,
        isCoursePolicy: isAdministrativeLabel(topicName),
        isGeneric: !isAcademicTopicName(topicName) && !isAdministrativeLabel(topicName),
        mistakes: [],
        lastAttemptId: null,
        lastAttemptLabel: null,
        lastAttemptCorrect: 0,
        lastAttemptAnswered: 0,
      };
      if (!latestIndex.has(topicName)) {
        latestIndex.set(topicName, attemptIndex);
        entry.lastAttemptId = attempt.id ?? null;
        entry.lastAttemptLabel = label;
      }
      const isLatestForTopic = latestIndex.get(topicName) === attemptIndex;

      const unanswered = isUnansweredResult(res);
      entry.total += 1;
      if (unanswered) {
        entry.unanswered += 1;
        totalUnanswered += 1;
      } else {
        entry.answered += 1;
        totalAnswered += 1;
        if (res.isCorrect) entry.correct += 1;
        else entry.incorrect += 1;
        if (isLatestForTopic) {
          entry.lastAttemptAnswered += 1;
          if (res.isCorrect) entry.lastAttemptCorrect += 1;
        }
      }
      if (!res.isCorrect) {
        entry.mistakes.push({
          question: res.questionText,
          userAnswer: unanswered ? '' : res.userAnswer,
          correctAnswer: res.correctAnswer,
          feedback: res.feedback,
          topic: topicName,
          unanswered,
        });
      }
      topicMap.set(topicName, entry);
    });
  });

  const topicStats: TopicStat[] = Array.from(topicMap.values()).map((stat) => ({
    ...stat,
    accuracy: stat.answered > 0 ? Math.round((stat.correct / stat.answered) * 100) : null,
  }));

  // Assessed topics first (lowest accuracy first), then not-assessed ones.
  topicStats.sort((a, b) => {
    if (a.accuracy === null && b.accuracy === null) return a.name.localeCompare(b.name);
    if (a.accuracy === null) return 1;
    if (b.accuracy === null) return -1;
    return a.accuracy - b.accuracy;
  });

  const academicAssessed = topicStats.filter((t) => !t.isCoursePolicy && !t.isGeneric && t.accuracy !== null);
  const weakTopics = academicAssessed.filter((t) => (t.accuracy as number) < 70).map((t) => t.name);
  const strongTopics = academicAssessed.filter((t) => (t.accuracy as number) >= 85).map((t) => t.name);

  const avgQuizScore = Math.round(attempts.reduce((sum, a) => sum + (Number(a.accuracy) || 0), 0) / attempts.length);

  const mistakeVault: Record<string, MistakeDetail[]> = {};
  topicStats.forEach((stat) => {
    if (stat.mistakes.length > 0 && !stat.isCoursePolicy && !stat.isGeneric) mistakeVault[stat.name] = stat.mistakes;
  });

  return {
    topicStats,
    weakTopics,
    strongTopics,
    avgQuizScore,
    readinessScore: avgQuizScore,
    avgAccuracy: avgQuizScore,
    totalQuizzes: attempts.length,
    totalAnswered,
    totalUnanswered,
    isEarlyResult: attempts.length < RELIABLE_TREND_ATTEMPTS,
    mistakeVault,
  };
}

/**
 * Topic progress for the study path / schedule: academic topics only.
 * Course-policy and placeholder topics are left out of practice planning.
 */
export function mapStatsToProgress(stats: TopicStat[]): TopicProgress[] {
  return stats
    .filter((s) => !s.isCoursePolicy && !s.isGeneric)
    .map((s) => ({
      name: s.name,
      percentage: s.accuracy,
      total: s.total,
      answered: s.answered,
      correct: s.correct,
      unanswered: s.unanswered,
      lastAttemptId: s.lastAttemptId,
      lastAttemptLabel: s.lastAttemptLabel,
      lastAttemptCorrect: s.lastAttemptCorrect,
      lastAttemptAnswered: s.lastAttemptAnswered,
    }));
}

/** "2 of 3 correct in your Nov 14 quiz" style evidence for a topic. */
export function topicEvidence(p: Pick<TopicProgress, 'answered' | 'correct' | 'unanswered' | 'lastAttemptLabel' | 'total'>): string {
  const answered = p.answered ?? 0;
  const unanswered = p.unanswered ?? 0;
  const when = p.lastAttemptLabel ? ` (latest quiz: ${p.lastAttemptLabel})` : '';
  if (answered === 0) {
    return unanswered > 0
      ? `Not assessed: ${unanswered} question${unanswered === 1 ? '' : 's'} left unanswered${when}`
      : 'Not assessed yet';
  }
  const base = `${p.correct ?? 0} of ${answered} answered question${answered === 1 ? '' : 's'} correct`;
  return `${base}${unanswered ? `, ${unanswered} unanswered` : ''}${when}`;
}
