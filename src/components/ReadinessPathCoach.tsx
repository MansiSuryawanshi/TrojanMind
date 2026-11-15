/**
 * Interactive color-based study path for Exam Readiness.
 * Red (weak) → Amber (moderate) → Green (strong): Claude-style coaching that
 * tells the student what to do next and advances them through the path.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import type { TopicProgress } from '../types';
import { saveRevisionTask } from '../services/firebaseService';
import { suggestSchedulePlacement } from '../services/scheduleSuggest';

export type PathBand = 'weak' | 'moderate' | 'strong';

export interface PathStep {
  id: string;
  band: PathBand;
  topic: string;
  percentage: number;
  title: string;
  why: string;
  actions: { id: string; label: string; kind: 'cross_exam' | 'schedule' | 'challenge' | 'next' }[];
}

interface Props {
  focusTopic: string | null;
  onFocusTopic: (topic: string) => void;
  onStartCrossExam: (topic: string) => void;
  onGoToSchedule: () => void;
  onGoToChallenge: () => void;
}

function bandFor(pct: number): PathBand {
  if (pct > 75) return 'strong';
  if (pct >= 50) return 'moderate';
  return 'weak';
}

function bandMeta(band: PathBand) {
  if (band === 'weak') {
    return {
      label: 'Focus now',
      color: 'var(--color-danger)',
      soft: 'var(--color-danger-soft)',
      hint: 'Red — close this gap before anything else',
    };
  }
  if (band === 'moderate') {
    return {
      label: 'Then strengthen',
      color: 'var(--color-amber, #b45309)',
      soft: 'var(--color-warning-soft, #fef3c7)',
      hint: 'Amber — lock this in after reds improve',
    };
  }
  return {
    label: 'Maintain',
    color: 'var(--color-success)',
    soft: 'var(--color-success-soft)',
    hint: 'Green — quick refresh only, then return to gaps',
  };
}

function buildPath(topics: TopicProgress[]): PathStep[] {
  const sorted = [...topics].sort((a, b) => a.percentage - b.percentage);
  const weak = sorted.filter((t) => bandFor(t.percentage) === 'weak').slice(0, 3);
  const moderate = sorted.filter((t) => bandFor(t.percentage) === 'moderate').slice(0, 2);
  const strong = sorted.filter((t) => bandFor(t.percentage) === 'strong').slice(0, 1);

  const steps: PathStep[] = [];

  weak.forEach((t, i) => {
    steps.push({
      id: `weak-${t.name}-${i}`,
      band: 'weak',
      topic: t.name,
      percentage: t.percentage,
      title: i === 0 ? `Start here: ${t.name}` : `Next red gap: ${t.name}`,
      why:
        i === 0
          ? `This is your weakest signal (${t.percentage}%). Spend a full session explaining it out loud, then defend it in Cross-Examination.`
          : `Still red at ${t.percentage}%. Only after the previous red feels clearer — cross-examine, then check Topic Coverage again.`,
      actions: [
        { id: 'cx', label: 'Cross-examine this', kind: 'cross_exam' },
        { id: 'sch', label: 'Add to study plan', kind: 'schedule' },
        { id: 'next', label: 'I finished — next topic', kind: 'next' },
      ],
    });
  });

  moderate.forEach((t, i) => {
    steps.push({
      id: `mod-${t.name}-${i}`,
      band: 'moderate',
      topic: t.name,
      percentage: t.percentage,
      title: `Then strengthen: ${t.name}`,
      why: `Amber at ${t.percentage}% — you know pieces of it. Run a short Challenge set, then one Cross-Examination to push it into green.`,
      actions: [
        { id: 'ch', label: 'Practice in Challenge', kind: 'challenge' },
        { id: 'cx', label: 'Cross-examine', kind: 'cross_exam' },
        { id: 'next', label: 'Move on', kind: 'next' },
      ],
    });
  });

  strong.forEach((t, i) => {
    steps.push({
      id: `str-${t.name}-${i}`,
      band: 'strong',
      topic: t.name,
      percentage: t.percentage,
      title: `Quick maintain: ${t.name}`,
      why: `Green at ${t.percentage}%. Do a 5-minute recall only — then go back to any remaining red topics.`,
      actions: [
        { id: 'cx', label: 'Quick probe', kind: 'cross_exam' },
        { id: 'next', label: 'Back to gaps', kind: 'next' },
      ],
    });
  });

  return steps;
}

function coachBlurb(
  steps: PathStep[],
  stepIndex: number,
  readiness: number,
  daysLeft: number | null
): string {
  const current = steps[stepIndex];
  const reds = steps.filter((s) => s.band === 'weak').length;
  const urgency =
    daysLeft !== null && daysLeft <= 3
      ? `Only ${daysLeft} day${daysLeft === 1 ? '' : 's'} left — stay on red topics until they move amber.`
      : daysLeft !== null && daysLeft <= 7
        ? `${daysLeft} days left: clear reds first, then amber.`
        : 'Follow the color path: red → amber → green.';

  if (!current) {
    return `You're caught up on the path. Keep readiness (${readiness}/100) climbing with light reviews.`;
  }

  if (current.band === 'weak') {
    return `Coach: Focus on "${current.topic}" now (${current.percentage}% — red). ${urgency} Do not jump to green topics yet${reds > 1 ? ` — ${reds} red gaps still need attention` : ''}.`;
  }
  if (current.band === 'moderate') {
    return `Coach: Reds are clearer — now push "${current.topic}" from amber (${current.percentage}%) toward green with practice + one defense.`;
  }
  return `Coach: "${current.topic}" is already green. Quick maintain only, then loop back if any topic turns red again.`;
}

export const ReadinessPathCoach: React.FC<Props> = ({
  focusTopic,
  onFocusTopic,
  onStartCrossExam,
  onGoToSchedule,
  onGoToChallenge,
}) => {
  const topics = useStore((s) => s.topicProgress);
  const readiness = useStore((s) => s.readinessScore);
  const daysLeft = useStore((s) => s.daysLeft);
  const examDate = useStore((s) => s.examDate);
  const revisionTasks = useStore((s) => s.revisionTasks);
  const addRevisionTaskLocal = useStore((s) => s.addRevisionTaskLocal);
  const summaryBridge = useStore((s) => s.summaryBridge);

  const steps = useMemo(() => buildPath(topics), [topics]);
  const [stepIndex, setStepIndex] = useState(0);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [savingPlan, setSavingPlan] = useState(false);
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  // Keep step aligned with focus topic / refreshed path
  useEffect(() => {
    if (!steps.length) {
      setStepIndex(0);
      return;
    }
    if (focusTopic) {
      const idx = steps.findIndex((s) => s.topic === focusTopic);
      if (idx >= 0) {
        setStepIndex(idx);
        return;
      }
    }
    setStepIndex((i) => Math.min(i, steps.length - 1));
  }, [steps, focusTopic]);

  const current = steps[stepIndex] ?? null;
  const blurb = coachBlurb(steps, stepIndex, readiness, daysLeft);

  const advance = () => {
    if (!current) return;
    setDoneIds((prev) => new Set(prev).add(current.id));
    // Prefer next unfinished step; if at end of reds with unfinished earlier, wrap
    const nextIdx = steps.findIndex((s, i) => i > stepIndex && !doneIds.has(s.id) && s.id !== current.id);
    if (nextIdx >= 0) {
      setStepIndex(nextIdx);
      onFocusTopic(steps[nextIdx].topic);
      return;
    }
    const firstOpen = steps.findIndex((s) => !doneIds.has(s.id) && s.id !== current.id);
    if (firstOpen >= 0) {
      setStepIndex(firstOpen);
      onFocusTopic(steps[firstOpen].topic);
      return;
    }
    // All marked — jump back to first weak if any
    const firstWeak = steps.findIndex((s) => s.band === 'weak');
    const target = firstWeak >= 0 ? firstWeak : 0;
    setStepIndex(target);
    if (steps[target]) onFocusTopic(steps[target].topic);
  };

  const addCurrentToStudyPlan = async () => {
    if (!current || savingPlan) return;
    onFocusTopic(current.topic);
    setSavingPlan(true);
    setPlanMsg(null);
    setPlanError(null);

    try {
      const suggestion = suggestSchedulePlacement({
        topic: current.topic,
        summary: null,
        topicProgress: topics,
        revisionTasks,
        daysLeft,
        examDate,
      });

      // Prefer sequencing after the previous path step when available
      const prevStep = stepIndex > 0 ? steps[stepIndex - 1] : null;
      const afterTopic = prevStep?.topic || suggestion.afterTopic;
      const nextTopic = steps[stepIndex + 1]?.topic || suggestion.nextTopic;

      const task: Parameters<typeof saveRevisionTask>[0] = {
        topic: current.topic,
        date: suggestion.date,
        durationMinutes: suggestion.durationMinutes,
        source: 'exam_prep',
        studyFocus: suggestion.studyFocus,
        suggestionReason: suggestion.reason,
      };
      // Firestore rejects `undefined` — only include optional fields when set
      if (summaryBridge.documentId) task.documentId = summaryBridge.documentId;
      if (summaryBridge.fileName) task.fileName = summaryBridge.fileName;
      if (afterTopic) task.afterTopic = afterTopic;
      if (nextTopic) task.nextTopic = nextTopic;

      const id = await saveRevisionTask(task);
      addRevisionTaskLocal({ ...task, id, createdAt: null });

      setPlanMsg(
        `Saved “${current.topic}” for ${suggestion.date} · ${suggestion.durationMinutes} min` +
          (afterTopic ? ` (after ${afterTopic})` : '')
      );
      setDoneIds((prev) => new Set(prev).add(current.id));
    } catch (err) {
      console.error('[PathCoach] Failed to save study plan task', err);
      setPlanError(
        err instanceof Error ? err.message : 'Could not save to Study Schedule. Try again.'
      );
    } finally {
      setSavingPlan(false);
    }
  };

  const runAction = (kind: PathStep['actions'][number]['kind']) => {
    if (!current) return;
    onFocusTopic(current.topic);
    if (kind === 'cross_exam') onStartCrossExam(current.topic);
    else if (kind === 'schedule') void addCurrentToStudyPlan();
    else if (kind === 'challenge') onGoToChallenge();
    else advance();
  };

  if (!topics.length) return null;

  return (
    <div className="ep-card readiness-path-coach">
      <div className="ep-card-header">
        <h3 className="ep-card-title">Your connected study path</h3>
        <span className="ep-card-subtitle">Red → amber → green</span>
      </div>

      <p className="path-coach-blurb" role="status">
        {blurb}
      </p>

      {/* Color legend / flow */}
      <div className="path-flow" aria-hidden="true">
        <span className="path-flow-pill path-flow-pill--weak">1 · Red focus</span>
        <span className="path-flow-arrow">→</span>
        <span className="path-flow-pill path-flow-pill--mod">2 · Amber strengthen</span>
        <span className="path-flow-arrow">→</span>
        <span className="path-flow-pill path-flow-pill--strong">3 · Green maintain</span>
      </div>

      {/* Step rail */}
      <ol className="path-rail">
        {steps.map((step, i) => {
          const meta = bandMeta(step.band);
          const active = i === stepIndex;
          const done = doneIds.has(step.id);
          return (
            <li key={step.id}>
              <button
                type="button"
                className={`path-rail-item ${active ? 'path-rail-item--active' : ''} ${done ? 'path-rail-item--done' : ''}`}
                style={{
                  borderColor: active ? meta.color : undefined,
                  background: active ? meta.soft : undefined,
                }}
                onClick={() => {
                  setStepIndex(i);
                  onFocusTopic(step.topic);
                }}
              >
                <span className="path-rail-dot" style={{ background: meta.color }} />
                <span className="path-rail-text">
                  <span className="path-rail-band">{meta.label}</span>
                  <span className="path-rail-topic">{step.topic}</span>
                </span>
                <span className="path-rail-pct" style={{ color: meta.color }}>
                  {step.percentage}%
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {current && (
        <div
          className="path-focus-card"
          style={{ borderLeftColor: bandMeta(current.band).color }}
        >
          <div className="path-focus-top">
            <span
              className="path-focus-band"
              style={{
                color: bandMeta(current.band).color,
                background: bandMeta(current.band).soft,
              }}
            >
              {bandMeta(current.band).hint}
            </span>
            <span className="path-focus-step">
              Step {stepIndex + 1} of {steps.length}
            </span>
          </div>
          <h4 className="path-focus-title">{current.title}</h4>
          <p className="path-focus-why">{current.why}</p>

          {planMsg && (
            <div className="path-plan-toast path-plan-toast--ok" role="status">
              <span>{planMsg}</span>
              <button type="button" className="path-plan-link" onClick={onGoToSchedule}>
                Open Study Schedule →
              </button>
            </div>
          )}
          {planError && (
            <div className="path-plan-toast path-plan-toast--err" role="alert">
              {planError}
            </div>
          )}

          <div className="path-focus-actions">
            {current.actions.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={a.kind === 'schedule' && savingPlan}
                className={
                  a.kind === 'cross_exam' || a.kind === 'next'
                    ? 'btn-primary path-action-btn'
                    : 'btn-secondary path-action-btn'
                }
                onClick={() => runAction(a.kind)}
              >
                {a.kind === 'schedule' && savingPlan ? 'Saving…' : a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReadinessPathCoach;
