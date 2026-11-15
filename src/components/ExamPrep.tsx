import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ReadinessScore } from './ReadinessScore';
import { WeakAreas } from './WeakAreas';
import { CrossExamination } from './CrossExamination';
import { ReadinessPathCoach } from './ReadinessPathCoach';
import { BrightspaceExamDates } from './BrightspaceExamDates';
import { OfficialFinalExams } from './OfficialFinalExams';
import { useStore } from '../store/store';
import { saveExamDate } from '../services/firebaseService';
import { deriveStudentAnalytics, mapStatsToProgress } from '../services/analyticsService';

interface ExamPrepProps {
  onGoToSchedule?: () => void;
  onGoToChallenge?: () => void;
}

export const ExamPrep: React.FC<ExamPrepProps> = ({
  onGoToSchedule,
  onGoToChallenge,
}) => {
  const setTopicProgress = useStore((s) => s.setTopicProgress);
  const setWeakAreas     = useStore((s) => s.setWeakAreas);
  const setReadinessScore = useStore((s) => s.setReadinessScore);

  // Centralized State from Store
  const examDate    = useStore((s) => s.examDate);
  const setExamDate = useStore((s) => s.setExamDate);
  const daysLeft    = useStore((s) => s.daysLeft);
  const setDaysLeft = useStore((s) => s.setDaysLeft);
  const allAttempts = useStore((s) => s.allAttempts);
  const isInitialLoadComplete = useStore((s) => s.isInitialLoadComplete);
  const topicProgress = useStore((s) => s.topicProgress);

  const [isLoading, setIsLoading] = useState(!isInitialLoadComplete);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [focusTopic, setFocusTopic] = useState<string | null>(null);
  const [launchTopic, setLaunchTopic] = useState<string | null>(null);
  const crossExamRef = useRef<HTMLDivElement>(null);

  // Derived check for empty state
  const hasData = allAttempts.length > 0;
  const analytics = useMemo(() => deriveStudentAnalytics(allAttempts), [allAttempts]);

  /** Standard calculation for the countdown. */
  const calculateDaysLeft = (targetDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Reactive Derivation: Triggered whenever history OR exam date changes.
  useEffect(() => {
    if (!isInitialLoadComplete && allAttempts.length === 0) return;

    console.group("[ExamPrep-REACTIVE] Syncing Analytics");
    const analytics = deriveStudentAnalytics(allAttempts);
    
    setTopicProgress(mapStatsToProgress(analytics.topicStats));
    setWeakAreas(analytics.weakTopics);
    setReadinessScore(analytics.readinessScore);
    setIsLoading(false);
    
    console.log(`Analytics Derived | Readiness: ${analytics.readinessScore}% | Topics: ${analytics.topicStats.length}`);
    console.groupEnd();
  }, [allAttempts, examDate, daysLeft, setTopicProgress, setWeakAreas, setReadinessScore, isInitialLoadComplete]);

  // Seed focus to weakest topic once data lands
  useEffect(() => {
    if (focusTopic || !topicProgress.length) return;
    const weakest = topicProgress
      .filter((t) => t.percentage != null)
      .sort((a, b) => (a.percentage as number) - (b.percentage as number))[0];
    if (weakest) setFocusTopic(weakest.name);
  }, [topicProgress, focusTopic]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) void applyExamDate(e.target.value);
  };

  const applyExamDate = async (newDate: string) => {
    const ds = calculateDaysLeft(newDate);
    console.log(`[ExamPrep-SYNC] New Date: ${newDate} (${ds} days)`);
    
    setExamDate(newDate);
    setDaysLeft(ds);
    setIsEditingDate(false);
    
    try {
      await saveExamDate(newDate);
    } catch (err) {
      console.error("[ExamPrep-SYNC] Save failed:", err);
    }
  };

  // Describes quiz practice only; it is not a verdict on exam readiness.
  const getScorePill = (score: number, early: boolean) => {
    if (early)       return { label: 'Early results',       cls: 'ep-pill-gold' };
    if (score >= 75) return { label: 'Scoring well',        cls: 'ep-pill-green' };
    if (score >= 50) return { label: 'Building up',         cls: 'ep-pill-gold' };
    return              { label: 'Needs more practice',  cls: 'ep-pill-amber' };
  };

  const pill = getScorePill(analytics.avgQuizScore, analytics.isEarlyResult);

  const startCrossExam = (topic: string) => {
    setFocusTopic(topic);
    setLaunchTopic(topic);
    requestAnimationFrame(() => {
      crossExamRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="ep-root flex items-center justify-center min-h-[60vh]">
        <div className="text-center" role="status">
          <div className="spinner mx-auto mb-4" />
          <p className="text-muted">Analyzing study landscape...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ep-root">
      {/* ── Page header ── */}
      <div className="ep-header">
        <div className="ep-header-left">
          <h1 className="ep-title">Exam Prep</h1>
          <p className="ep-subtitle">
            {daysLeft !== null && daysLeft <= 7
              ? 'Exam is close: start with the topics where you missed the most questions.'
              : 'Your quiz results by topic, and what to practice next.'}
          </p>
        </div>
        <div className="ep-header-right">
          <div
            className="ep-days-box"
            role={isEditingDate ? undefined : 'button'}
            tabIndex={isEditingDate ? undefined : 0}
            aria-label={isEditingDate ? undefined : 'Set exam date'}
            onClick={() => setIsEditingDate(true)}
            onKeyDown={(e) => {
              if (!isEditingDate && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setIsEditingDate(true);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            {isEditingDate ? (
              <input 
                type="date" 
                className="ep-date-input"
                aria-label="Exam date"
                autoFocus
                onChange={handleDateChange}
                onBlur={() => setIsEditingDate(false)}
                defaultValue={examDate || ''}
              />
            ) : (
              <>
                <span className="ep-days-number">
                  {daysLeft === null ? '--' : daysLeft < 0 ? 'Passed' : daysLeft === 0 ? 'Today' : daysLeft}
                </span>
                <span className="ep-days-label">
                  {daysLeft === null ? 'set date' : daysLeft < 0 ? 'exam date' : daysLeft === 0 ? 'is exam' : 'days left'}
                </span>
              </>
            )}
          </div>
          {hasData && <span className={`ep-readiness-pill ${pill.cls}`}>{pill.label}</span>}
        </div>
      </div>

      <OfficialFinalExams examDate={examDate} onUseDate={(d) => void applyExamDate(d)} />
      <BrightspaceExamDates examDate={examDate} onUseDate={(d) => void applyExamDate(d)} />

      {/* ── Empty state – no challenge data yet ── */}
      {!hasData && (
        <div className="ep-empty-state">
          <div className="ep-empty-icon">📋</div>
          <h3 className="ep-empty-title">No quiz results yet</h3>
          <p className="ep-empty-body">
            Take a quiz on your lecture material. Results here come only from questions you’ve actually answered.
          </p>
          {onGoToChallenge && (
            <button type="button" className="btn-primary mt-4 px-6 py-2.5 rounded-xl font-semibold" onClick={onGoToChallenge}>
              Take a quiz →
            </button>
          )}
        </div>
      )}

      {/* ── Two-column body (only shown when there is data) ── */}
      {hasData && (
        <div className="ep-body">
          {/* Left: score ring + weak areas */}
          <div className="ep-col-left">
            <ReadinessScore
              score={analytics.avgQuizScore}
              quizCount={analytics.totalQuizzes}
              isEarly={analytics.isEarlyResult}
              unanswered={analytics.totalUnanswered}
            />
            <WeakAreas
              onSelectTopic={(topic) => {
                setFocusTopic(topic);
                startCrossExam(topic);
              }}
            />
          </div>

          {/* Right: path coach + topic bars + cross-examination */}
          <div className="ep-col-right">
            <ReadinessPathCoach
              focusTopic={focusTopic}
              onFocusTopic={setFocusTopic}
              onStartCrossExam={startCrossExam}
              onGoToSchedule={() => onGoToSchedule?.()}
              onGoToChallenge={() => onGoToChallenge?.()}
            />
            <div ref={crossExamRef}>
              <CrossExamination
                launchTopic={launchTopic}
                onLaunchConsumed={() => setLaunchTopic(null)}
                highlightTopic={focusTopic}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
