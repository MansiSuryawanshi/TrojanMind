/**
 * Study Schedule tab — adaptive weekly plan based on concept gaps from the quiz.
 */
import React, { useState, useEffect, useRef } from 'react';
import type { ScheduleResponse } from '../types';
import { useStore } from '../store/store';
import { generateSchedule, type TopicAccuracyInput } from '../services/claudeService';
import { listRevisionTasks, updateRevisionTask } from '../services/firebaseService';
import { MetricsRow } from './MetricsRow';
import { DayScheduleCard } from './DayScheduleCard';
import { planningDayCount } from '../services/scheduleSuggest';
import { deriveStudentAnalytics, mapStatsToProgress, topicEvidence } from '../services/analyticsService';
import { isAcademicTopicName } from '../services/contentClassification';

interface StudyScheduleProps {
  onSwitchToChallenge: () => void;
  /** Opens Upload so the student can add lecture material. */
  onAddMaterial?: () => void;
}

export const StudySchedule: React.FC<StudyScheduleProps> = ({ onSwitchToChallenge, onAddMaterial }) => {
  const cachedSchedule = useStore((state) => state.schedule);
  const setSchedule = useStore((state) => state.setSchedule);

  // Global Context
  const examDate    = useStore((s) => s.examDate);
  const daysLeft    = useStore((s) => s.daysLeft);
  const allAttempts = useStore((s) => s.allAttempts);
  const isInitialLoadComplete = useStore((s) => s.isInitialLoadComplete);
  const revisionTasks = useStore((s) => s.revisionTasks);
  const setRevisionTasks = useStore((s) => s.setRevisionTasks);

  const [localSchedule, setLocalSchedule] = useState<ScheduleResponse | null>(cachedSchedule);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newGapsNudge, setNewGapsNudge] = useState(false);

  // Derived state from history (Calculated once based on store)
  const [conceptGaps, setConceptGaps] = useState<string[]>([]);
  const [topicAccuracy, setTopicAccuracy] = useState<TopicAccuracyInput[]>([]);
  const [avgScore, setAvgScore] = useState(0);
  const [isEarly, setIsEarly] = useState(true);

  const prevGapCount = useRef(0);
  const prevExamDate = useRef<string | null>(examDate);

  useEffect(() => {
    void (async () => {
      try {
        const tasks = await listRevisionTasks();
        setRevisionTasks(tasks);
      } catch {
        /* ignore */
      }
    })();
  }, [setRevisionTasks]);

  // Reactive Logic: Monitor store for new history or new exam date
  useEffect(() => {
    if (!isInitialLoadComplete && allAttempts.length === 0) return;

    // 1. Check for History Updates
    if (allAttempts.length > 0) {
      // Real per-topic results across all attempts; academic topics that were
      // actually answered. Untested topics are never treated as 0%.
      const analytics = deriveStudentAnalytics(allAttempts);
      const accuracy: TopicAccuracyInput[] = mapStatsToProgress(analytics.topicStats)
        .filter((p) => p.percentage != null)
        .map((p) => ({ topic: p.name, accuracy: p.percentage as number, evidence: topicEvidence(p) }))
        .sort((a, b) => a.accuracy - b.accuracy);

      setTopicAccuracy(accuracy);
      setAvgScore(analytics.avgQuizScore);
      setIsEarly(analytics.isEarlyResult);
      const gaps = analytics.weakTopics;
      setConceptGaps(gaps);

      // 2. Manage Nudges
      if (prevGapCount.current > 0 && gaps.length > prevGapCount.current) {
        setNewGapsNudge(true);
      }
      prevGapCount.current = gaps.length;
    }

    // 3. Monitor Exam Date Changes
    if (examDate !== prevExamDate.current) {
      console.log(`[StudySchedule-SYNC] Exam date changed: ${prevExamDate.current} -> ${examDate}. Flagging for regeneration.`);
      setNewGapsNudge(true);
      prevExamDate.current = examDate;
    }

    // Auto-generate if empty, but only when there are academic topics to plan.
    if (cachedSchedule === null && allAttempts.length > 0 && !loading && hasAcademicEvidence(allAttempts)) {
      void fetchSchedule();
    }
  }, [allAttempts, examDate, isInitialLoadComplete, cachedSchedule, loading]);

  const uploadedMaterials = [
    ...new Set(
      allAttempts.flatMap((a) => a.selectedFileNames || []).filter(Boolean)
    ),
  ].slice(0, 8);

  const fetchScheduleWith = async (
    gaps: string[],
    score: number,
    accuracy: TopicAccuracyInput[],
    days: number
  ) => {
    console.group(`[StudySchedule-Pipeline] Generating plan...`);
    console.log(`Step 1: Context gathered. Gaps: ${gaps.length}, AvgScore: ${score}, DaysLeft: ${days}`);
    
    setLoading(true);
    setError(null);
    setNewGapsNudge(false);
    
    try {
      console.log(`Step 2: Calling Claude API (or local fallback)...`);
      const result = await generateSchedule(gaps, score, days, accuracy, uploadedMaterials, allAttempts.length);
      
      if (result.isFallback) {
        console.warn(`Step 3: AI Generation failed/unavailable. Using grounded fallback.`);
      } else {
        console.log(`Step 3: AI Generation SUCCESS!`);
      }
      
      setLocalSchedule(result);
      setSchedule(result);
      console.log(`Step 4: Schedule synchronized with global store.`);
    } catch (err: any) {
      console.error(`Step 3.FAIL: Critical error in schedule pipeline`, err);
      setError(err?.message || 'Unexpected failure in study plan generation.');
    } finally {
      setLoading(false);
      console.log(`Step 5: Pipeline finished. Loading cleared.`);
      console.groupEnd();
    }
  };

  const fetchSchedule = () => {
    // daysToExam for the API: exclusive "days left" — window is inclusive of exam day
    const window = planningDayCount(daysLeft, examDate);
    const daysToExam = Math.max(0, window - 1);
    return fetchScheduleWith(conceptGaps, avgScore, topicAccuracy, daysToExam);
  };

  const totalSessions =
    localSchedule?.schedule.reduce((sum, day) => sum + day.sessions.length, 0) ?? 0;

  /** Academic topics we can actually plan around. */
  const canPlan = topicAccuracy.length > 0;

  const updateSessionDuration = (dayIndex: number, sessionIndex: number, minutes: number) => {
    if (!localSchedule) return;
    const next: ScheduleResponse = {
      ...localSchedule,
      schedule: localSchedule.schedule.map((d, di) =>
        di !== dayIndex
          ? d
          : { ...d, sessions: d.sessions.map((s, si) => (si === sessionIndex ? { ...s, duration: `${minutes} min` } : s)) }
      ),
    };
    setLocalSchedule(next);
    setSchedule(next);
  };

  const updateTaskDuration = async (taskId: string | undefined, minutes: number) => {
    if (!taskId) return;
    setRevisionTasks(revisionTasks.map((t) => (t.id === taskId ? { ...t, durationMinutes: minutes } : t)));
    try {
      await updateRevisionTask(taskId, { durationMinutes: minutes });
    } catch (err) {
      console.error('[StudySchedule] Could not save the new duration', err);
    }
  };

  // ── Initial Loading from Store ──────────────────────────────────────────
  if (!isInitialLoadComplete) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center" role="status">
          <div className="spinner mx-auto mb-4" />
          <p className="text-muted">Loading your knowledge map...</p>
        </div>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (allAttempts.length === 0 && localSchedule === null && revisionTasks.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
        <div className="animate-slide-up surface rounded-2xl px-6 py-12 md:px-12 max-w-lg w-full">
          <div className="text-5xl mb-6">📅</div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink mb-3">No plan yet</h2>
          <p className="text-muted mb-8 max-w-sm mx-auto">
            Take a quiz on your lecture material, or add a topic from a summary. The plan is built from the topics you
            practice.
          </p>
          <button onClick={onSwitchToChallenge} className="btn-primary px-8 py-3.5 rounded-xl font-semibold">Take a quiz →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-8 md:py-10 max-w-3xl mx-auto">
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink mb-2">Adaptive Plan</h1>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-muted">What to study, why, and how, through your exam date. Time estimates are yours to adjust.</p>
          {totalSessions > 0 && <span className="px-3 py-1 rounded-full bg-success-soft border border-success/25 text-success text-xs font-semibold">{totalSessions} sessions planned</span>}
        </div>
        {examDate ? (
          <p className="text-xs text-muted mt-2">
            Planning window: today → <span className="font-semibold text-ink">{examDate}</span>
            {daysLeft != null ? ` (${Math.max(0, daysLeft)} day${daysLeft === 1 ? '' : 's'} left)` : ''}. Nothing after the exam.
          </p>
        ) : (
          <p className="text-xs text-warning mt-2">
            Set an exam date on Exam Prep so the plan stops on exam day.
          </p>
        )}
      </div>

      {localSchedule?.readiness_message && canPlan && (
        <div className="mb-6 p-4 rounded-xl bg-surface border border-line border-l-4 border-l-cardinal text-sm text-muted">
          <span className="font-semibold text-cardinal">Start with: </span>
          <span className="text-ink font-semibold">{localSchedule.priority_gap}</span> — {localSchedule.readiness_message}
        </div>
      )}

      {localSchedule?.isFallback && canPlan && (
        <div className="mb-5 p-4 rounded-xl bg-info-soft border border-info/20 flex flex-col gap-1 animate-fade-in">
          <span className="text-xs font-bold text-info uppercase tracking-wider">Basic plan</span>
          <p className="text-sm text-ink">The AI planner didn’t respond, so this plan was built from the questions you missed and your exam date. Regenerate to try again.</p>
        </div>
      )}

      {newGapsNudge && canPlan && (
        <div className="mb-5 p-4 rounded-xl bg-gold-soft border border-gold/60 flex flex-wrap gap-3 justify-between items-center animate-fade-in" role="status">
          <span className="text-sm text-ink font-medium">You have new quiz results or a new exam date. Update the plan?</span>
          <button type="button" onClick={() => void fetchSchedule()} className="btn-secondary shrink-0 rounded-lg px-4 py-1.5 text-xs font-semibold">Update plan</button>
        </div>
      )}

      {allAttempts.length > 0 && (
        <MetricsRow quizzesTaken={allAttempts.length} avgScore={avgScore} topicsToReview={conceptGaps.length} isEarly={isEarly} />
      )}

      {allAttempts.length > 0 && !canPlan && (
        <div className="mb-8 surface rounded-2xl border border-line p-5" role="status">
          <h2 className="text-lg font-extrabold text-ink mb-1">Nothing academic to plan yet</h2>
          <p className="text-sm text-muted mb-4">
            Your quizzes so far haven’t covered any course topics (for example, they were about course policies, or
            every question was left unanswered). Add lecture slides or notes, then take a quiz on them to get a plan.
          </p>
          <div className="flex flex-wrap gap-2">
            {onAddMaterial && (
              <button type="button" onClick={onAddMaterial} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">
                Add lecture material
              </button>
            )}
            <button type="button" onClick={onSwitchToChallenge} className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold">
              Take a quiz
            </button>
          </div>
        </div>
      )}

      {revisionTasks.length > 0 && (
        <div className="mb-8 mt-6 surface rounded-2xl border border-line p-5">
          <h2 className="text-lg font-extrabold text-ink mb-3">Topics you added</h2>
          <div className="space-y-2">
            {revisionTasks.map((t) => (
              <div
                key={t.id || `${t.topic}-${t.date}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-sm bg-sunken"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-ink flex flex-wrap items-center gap-2">
                    {t.topic}
                    {!isAcademicTopicName(t.topic) && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface border border-line text-muted">
                        Course information · not a study topic
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    {(() => {
                      const d = t.date ? new Date(t.date + 'T12:00:00') : null;
                      const pretty =
                        d && !Number.isNaN(d.getTime())
                          ? d.toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : t.date;
                      return pretty;
                    })()}
                    {t.fileName ? ` · ${t.fileName}` : ''}
                    {t.source ? ` · from ${t.source === 'exam_prep' ? 'Exam Prep' : t.source === 'summary' ? 'Summary' : 'you'}` : ''}
                  </div>
                  {(t.afterTopic || t.nextTopic) && (
                    <div className="text-xs text-ink mt-1">
                      Path:{' '}
                      {t.afterTopic ? <span className="text-muted">{t.afterTopic} → </span> : null}
                      <span className="font-semibold text-cardinal">{t.topic}</span>
                      {t.nextTopic ? <span className="text-muted"> → {t.nextTopic}</span> : null}
                    </div>
                  )}
                  {t.studyFocus && (
                    <p className="text-xs text-muted mt-1 leading-snug">{t.studyFocus}</p>
                  )}
                  {t.suggestionReason && (
                    <p className="text-[11px] text-muted italic mt-1 leading-snug">{t.suggestionReason}</p>
                  )}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted shrink-0">
                  Est.
                  <input
                    type="number"
                    min={5}
                    max={240}
                    step={5}
                    defaultValue={t.durationMinutes}
                    onBlur={(e) => {
                      const v = Math.max(5, Math.min(240, Number(e.target.value) || t.durationMinutes));
                      if (v !== t.durationMinutes) void updateTaskDuration(t.id, v);
                    }}
                    className="w-16 bg-surface border border-line rounded-md px-2 py-1 text-xs text-ink"
                    aria-label={`Estimated minutes for ${t.topic}`}
                  />
                  min
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16" role="status">
          <div className="spinner mx-auto mb-5" />
          <p className="text-ink text-base font-medium">Building your plan…</p>
          <p className="text-muted text-sm mt-1">Using the topics you missed and your exam date</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-danger-soft border border-danger/20 text-danger text-sm mb-6" role="alert">
          <span className="font-semibold">Error: </span>{error}
        </div>
      )}

      {/* Day cards */}
      {!loading && localSchedule && canPlan && (
        <div className="space-y-3 animate-fade-in">
          {localSchedule.schedule.map((day, i) => (
            <DayScheduleCard
              key={i}
              day={day}
              onDurationChange={(sessionIndex, minutes) => updateSessionDuration(i, sessionIndex, minutes)}
            />
          ))}
        </div>
      )}

      {/* Regenerate button */}
      {!loading && canPlan && (
        <div className="text-center mt-8">
          <button
            onClick={() => void fetchSchedule()}
            type="button"
            className="btn-secondary px-8 py-3 rounded-xl text-sm font-semibold"
          >
            {localSchedule ? 'Rebuild plan' : 'Build plan'}
          </button>
        </div>
      )}
    </div>
  );
};

/** True when at least one answered question in the attempts is on an academic topic. */
function hasAcademicEvidence(attempts: { questionResults?: { topic?: string | null; userAnswer?: string; unanswered?: boolean }[] }[]): boolean {
  return attempts.some((a) =>
    (a.questionResults || []).some((r) => {
      const answered = !r.unanswered && !!(r.userAnswer || '').trim() && r.userAnswer !== 'TIME_OUT';
      return answered && isAcademicTopicName(r.topic);
    })
  );
}
