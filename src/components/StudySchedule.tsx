/**
 * Study Schedule tab — adaptive weekly plan based on concept gaps from the quiz.
 */
import React, { useState, useEffect, useRef } from 'react';
import type { ScheduleResponse } from '../types';
import { useStore } from '../store/store';
import { generateSchedule } from '../services/claudeService';
import { listRevisionTasks } from '../services/firebaseService';
import { MetricsRow } from './MetricsRow';
import { DayScheduleCard } from './DayScheduleCard';

interface StudyScheduleProps {
  onSwitchToChallenge: () => void;
}

export const StudySchedule: React.FC<StudyScheduleProps> = ({ onSwitchToChallenge }) => {
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
  const [topicAccuracy, setTopicAccuracy] = useState<{ topic: string; accuracy: number }[]>([]);
  const [avgScore, setAvgScore] = useState(0);

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
      const latest = allAttempts[0];
      const weakSet = new Set(latest.weakTopics);
      const strongSet = new Set(latest.strongTopics);
      const allTopics = [...new Set([...latest.weakTopics, ...latest.strongTopics])];

      const accuracy = allTopics.map(topic => {
        const inWeak   = weakSet.has(topic);
        const inStrong = strongSet.has(topic);
        if (inWeak && !inStrong)  return { topic, accuracy: 0 };
        if (!inWeak && inStrong)  return { topic, accuracy: 100 };
        return { topic, accuracy: 50 };
      }).sort((a, b) => a.accuracy - b.accuracy);

      setTopicAccuracy(accuracy);
      setAvgScore(latest.accuracy);
      const gaps = accuracy.filter(t => t.accuracy < 70).map(t => t.topic);
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

    // Auto-generate if empty
    if (cachedSchedule === null && allAttempts.length > 0 && !loading) {
      void fetchSchedule();
    }
  }, [allAttempts, examDate, isInitialLoadComplete, cachedSchedule, loading]);

  const fetchScheduleWith = async (
    gaps: string[],
    score: number,
    accuracy: { topic: string; accuracy: number }[],
    days: number
  ) => {
    console.group(`[StudySchedule-Pipeline] Generating plan...`);
    console.log(`Step 1: Context gathered. Gaps: ${gaps.length}, AvgScore: ${score}, DaysLeft: ${days}`);
    
    setLoading(true);
    setError(null);
    setNewGapsNudge(false);
    
    try {
      console.log(`Step 2: Calling Claude API (or local fallback)...`);
      const result = await generateSchedule(gaps, score, days, accuracy);
      
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

  const fetchSchedule = () => fetchScheduleWith(conceptGaps, avgScore, topicAccuracy, daysLeft ?? 7);

  const totalSessions =
    localSchedule?.schedule.reduce((sum, day) => sum + day.sessions.length, 0) ?? 0;

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
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink mb-3">No Plan Yet</h2>
          <p className="text-muted mb-8 max-w-sm mx-auto">Complete a challenge or add a topic from Summary to unlock your plan.</p>
          <button onClick={onSwitchToChallenge} className="btn-primary px-8 py-3.5 rounded-xl font-semibold">Start a Challenge →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-8 md:py-10 max-w-3xl mx-auto">
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-ink mb-2">Adaptive Plan</h1>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-muted">Based on your concept gaps</p>
          {totalSessions > 0 && <span className="px-3 py-1 rounded-full bg-success-soft border border-success/25 text-success text-xs font-semibold">{totalSessions} sessions planned</span>}
        </div>
      </div>

      {localSchedule?.readiness_message && (
        <div className="mb-6 p-4 rounded-xl bg-surface border border-line border-l-4 border-l-cardinal text-sm text-muted">
          <span className="font-semibold text-cardinal">Priority gap: </span>
          <span className="text-ink font-semibold">{localSchedule.priority_gap}</span> — {localSchedule.readiness_message}
        </div>
      )}

      {localSchedule?.isFallback && (
        <div className="mb-5 p-4 rounded-xl bg-info-soft border border-info/20 flex flex-col gap-1 animate-fade-in">
          <span className="text-xs font-bold text-info uppercase tracking-wider">Grounded Fallback</span>
          <p className="text-sm text-ink">AI generation failed/unavailable. Showing a static plan optimized for your recent mistakes and exam deadline.</p>
        </div>
      )}

      {newGapsNudge && (
        <div className="mb-5 p-4 rounded-xl bg-gold-soft border border-gold/60 flex flex-wrap gap-3 justify-between items-center animate-fade-in" role="status">
          <span className="text-sm text-ink font-medium">New performance data — recalculate plan?</span>
          <button type="button" onClick={() => void fetchSchedule()} className="btn-secondary shrink-0 rounded-lg px-4 py-1.5 text-xs font-semibold">Regenerate</button>
        </div>
      )}

      <MetricsRow challengesDone={allAttempts.length} avgScore={avgScore} gapsCount={conceptGaps.length} />

      {revisionTasks.length > 0 && (
        <div className="mb-8 mt-6 surface rounded-2xl border border-line p-5">
          <h2 className="text-lg font-extrabold text-ink mb-3">Revision tasks from Summary / Exam Prep</h2>
          <div className="space-y-2">
            {revisionTasks.map((t) => (
              <div
                key={t.id || `${t.topic}-${t.date}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3 text-sm bg-sunken"
              >
                <div>
                  <div className="font-bold text-ink">{t.topic}</div>
                  <div className="text-xs text-muted">
                    {t.date} · {t.durationMinutes} min
                    {t.fileName ? ` · ${t.fileName}` : ''}
                    {t.source ? ` · via ${t.source}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16" role="status">
          <div className="spinner mx-auto mb-5" />
          <p className="text-ink text-base font-medium">Generating your adaptive plan...</p>
          <p className="text-muted text-sm mt-1">Claude is thinking hard for you</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-danger-soft border border-danger/20 text-danger text-sm mb-6" role="alert">
          <span className="font-semibold">Error: </span>{error}
        </div>
      )}

      {/* Day cards */}
      {!loading && localSchedule && (
        <div className="space-y-3 animate-fade-in">
          {localSchedule.schedule.map((day, i) => (
            <DayScheduleCard key={i} day={day} />
          ))}
        </div>
      )}

      {/* Regenerate button */}
      {!loading && (
        <div className="text-center mt-8">
          <button
            onClick={() => void fetchSchedule()}
            type="button"
            className="btn-secondary px-8 py-3 rounded-xl text-sm font-semibold"
          >
            Regenerate Plan
          </button>
        </div>
      )}
    </div>
  );
};
