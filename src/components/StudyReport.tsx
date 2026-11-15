import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Award, 
  Clock, 
  ChevronDown, 
  Brain, 
  BarChart2, 
  Calendar,
  Activity
} from 'lucide-react';
import type { QuizAttempt } from '../types';
import { getUserId, listUserDocuments, listAllSummaries, listMistakes } from '../services/firebaseService';
import { generateReport } from '../services/claudeService';
import { useStore } from '../store/store';
import { deriveStudentAnalytics, isUnansweredResult, type TopicStat } from '../services/analyticsService';
import { isAcademicTopicName } from '../services/contentClassification';

// ── TYPES ───────────────────────────────────────────────────────────────────

interface DashboardMetrics {
  totalQuizzes: number;
  /** Plain average of recorded quiz scores (%). */
  avgAccuracy: number;
  bestScore: number;
  worstScore: number;
  /** Latest quiz minus the average, in points; null with fewer than 2 quizzes. */
  trend: number | null;
  isEarly: boolean;
  academicTopics: TopicStat[];
  policyTopics: TopicStat[];
  totalUnanswered: number;
}

// ── COMPONENTS ──────────────────────────────────────────────────────────────

const ProgressChart: React.FC<{ data: QuizAttempt[] }> = ({ data }) => {
  if (data.length < 2) return (
    <div className="h-48 flex items-center justify-center border border-dashed border-line-strong rounded-xl text-muted font-medium text-center px-4">
      Take more quizzes to see progress trends
    </div>
  );

  const points = data.slice().reverse().map((a, i) => ({
    x: i,
    y: a.accuracy
  }));

  const maxPoints = points.length;
  const width = 600;
  const height = 150;
  const padding = 20;

  const getX = (i: number) => (i / (maxPoints - 1)) * (width - padding * 2) + padding;
  const getY = (y: number) => height - (y / 100) * (height - padding * 2) - padding;

  const pathData = points.reduce((acc, p, i) => 
    acc + `${i === 0 ? 'M' : 'L'} ${getX(p.x)} ${getY(p.y)}`, 
  '');

  const areaData = pathData + ` L ${getX(points[points.length - 1].x)} ${height} L ${getX(points[0].x)} ${height} Z`;

  return (
    <div className="w-full h-48 relative group">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" role="img" aria-label="Quiz accuracy over time">
        {[0, 50, 100].map((v) => (
          <line
            key={v}
            x1={padding}
            x2={width - padding}
            y1={getY(v)}
            y2={getY(v)}
            style={{ stroke: 'var(--color-line)' }}
            strokeWidth="1"
            strokeDasharray={v === 0 ? undefined : '4 4'}
          />
        ))}
        <motion.path
          d={areaData}
          style={{ fill: 'var(--color-cardinal)' }}
          fillOpacity={0.07}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        />
        <motion.path
          d={pathData}
          fill="none"
          style={{ stroke: 'var(--color-cardinal)' }}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />
        {points.map((p, i) => (
          <motion.circle
            key={i}
            cx={getX(p.x)}
            cy={getY(p.y)}
            r="4.5"
            style={{ fill: 'var(--color-cardinal)', stroke: 'var(--color-surface)' }}
            strokeWidth="2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.5 + (i * 0.1) }}
          >
            <title>{p.y}% Accuracy</title>
          </motion.circle>
        ))}
      </svg>
      <div className="absolute -bottom-5 left-0 w-full flex justify-between text-[10px] uppercase font-semibold text-muted tracking-wider px-2">
        <span>Oldest</span>
        <span>Latest Activity</span>
      </div>
    </div>
  );
};

const QuizAttemptCard: React.FC<{ attempt: QuizAttempt }> = ({ attempt }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const date = new Date((attempt.createdAt?.seconds || 0) * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="surface rounded-xl overflow-hidden transition-colors hover:border-line-strong">
      <div 
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        className="p-4 sm:p-6 cursor-pointer flex items-center justify-between gap-4 hover:bg-canvas"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center font-bold text-sm ${attempt.accuracy >= 70 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
            {attempt.accuracy}%
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-ink mb-0.5 line-clamp-1">{attempt.selectedFileNames.join(', ')}</h4>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted font-medium">
               <span className="flex items-center gap-1"><Calendar size={12}/> {date}</span>
               <span className="flex items-center gap-1"><Award size={12}/> {attempt.score} pts</span>
               {attempt.questionResults.some(isUnansweredResult) && (
                 <span>{attempt.questionResults.filter(isUnansweredResult).length} unanswered</span>
               )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6 shrink-0">
           <div className="hidden md:flex flex-col items-end">
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider leading-none mb-1">Results</span>
              <span className="text-sm font-bold text-ink">{attempt.correctCount} / {attempt.totalQuestions} Correct</span>
           </div>
           <div className={`w-8 h-8 rounded-full bg-sunken flex items-center justify-center transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
             <ChevronDown size={18} className="text-muted" />
           </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-line bg-canvas"
          >
            <div className="p-4 sm:p-6 space-y-3">
              {attempt.questionResults.map((res, i) => {
                const unanswered = isUnansweredResult(res);
                return (
                <div key={i} className={`p-4 rounded-xl bg-surface border border-line border-l-4 ${res.isCorrect ? 'border-l-success' : unanswered ? 'border-l-line-strong' : 'border-l-danger'}`}>
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase text-cardinal tracking-wider">{res.type === 'mcq' ? 'Multiple Choice' : 'Reasoning'}</span>
                      <p className="font-bold text-sm text-ink leading-tight">{res.questionText}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${res.isCorrect ? 'bg-success-soft text-success border-success/25' : unanswered ? 'bg-sunken text-muted border-line' : 'bg-danger-soft text-danger border-danger/25'}`}>
                      {res.isCorrect ? 'Correct' : unanswered ? 'Unanswered' : 'Incorrect'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
                    <div>
                      <p className="text-muted uppercase mb-1">Your Answer</p>
                      <p className={res.isCorrect ? 'text-success' : unanswered ? 'text-muted' : 'text-danger'}>{unanswered ? 'No answer (time ran out)' : res.userAnswer}</p>
                    </div>
                    {!res.isCorrect && (
                      <div>
                        <p className="text-muted uppercase mb-1">Ideal Answer</p>
                        <p className="text-ink font-medium">{res.correctAnswer}</p>
                      </div>
                    )}
                  </div>
                  {res.feedback && (
                    <div className="p-3 bg-canvas rounded-lg text-xs text-muted italic border border-line">
                      {res.feedback}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── MAIN DASHBOARD ─────────────────────────────────────────────────────────

export const StudyReport: React.FC = () => {
  // Global Store
  const attempts = useStore((s) => s.allAttempts);
  const isInitialLoadComplete = useStore((s) => s.isInitialLoadComplete);
  const summaryBridge = useStore((s) => s.summaryBridge);

  const [isLoading, setIsLoading] = useState(!isInitialLoadComplete);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [docInsights, setDocInsights] = useState<{
    uploads: number;
    summaries: number;
    mistakes: number;
    missedConcepts: string[];
  } | null>(null);

  useEffect(() => {
    if (isInitialLoadComplete) {
      setIsLoading(false);
      console.log(`[StudyReport-SYNC] Dashboard grounded in ${attempts.length} attempts.`);
    }
  }, [isInitialLoadComplete, attempts.length]);

  useEffect(() => {
    void (async () => {
      try {
        const [docs, sums, mistakes] = await Promise.all([
          listUserDocuments(),
          listAllSummaries(),
          listMistakes(),
        ]);
        const missed = [
          ...new Set(
            mistakes
              .filter((m) => isAcademicTopicName(m.conceptMisunderstood))
              .map((m) => m.conceptMisunderstood as string)
          ),
        ].slice(0, 8);
        setDocInsights({
          uploads: docs.length,
          summaries: sums.length,
          mistakes: mistakes.filter((m) => !m.reviewed).length,
          missedConcepts: missed,
        });
      } catch {
        setDocInsights(null);
      }
    })();
  }, [attempts.length]);

  const loadData = async () => {
     // Re-trigger global sync if needed, but the loader handles it.
     console.log("[StudyReport] Refreshing stats via global state...");
  };

  const metrics = useMemo((): DashboardMetrics | null => {
    if (attempts.length === 0) return null;
    const analytics = deriveStudentAnalytics(attempts);
    const accuracies = attempts.map((a) => Number(a.accuracy) || 0);
    return {
      totalQuizzes: attempts.length,
      avgAccuracy: analytics.avgQuizScore,
      bestScore: Math.max(...accuracies),
      worstScore: Math.min(...accuracies),
      trend: attempts.length >= 2 ? accuracies[0] - analytics.avgQuizScore : null,
      isEarly: analytics.isEarlyResult,
      academicTopics: analytics.topicStats.filter((t) => !t.isCoursePolicy && !t.isGeneric),
      policyTopics: analytics.topicStats.filter((t) => t.isCoursePolicy),
      totalUnanswered: analytics.totalUnanswered,
    };
  }, [attempts]);

  const handleGenerateAiInsights = async () => {
    if (!metrics) return;
    setIsGeneratingAi(true);
    try {
      const snapshot = {
        quizSessions: attempts.map(a => ({ scoreA: a.accuracy, conceptGaps: (a.weakTopics || []).filter(isAcademicTopicName), misconceptions: [], depthInsight: '' })),
        scheduleAdherence: { sessionsPlanned: 0, sessionsCompleted: 0, priorityGap: '' },
        examReadiness: { overallScore: metrics.avgAccuracy, topicCoverage: [], weakAreas: [], crossExamsPassed: 0, crossExamsFailed: 0 }
      };
      
      const report = await generateReport(snapshot as any);
      setAiReport(report.sections.map(s => `**${s.title}**: ${s.summary}`).join('\n\n'));
    } catch (err) {
      console.error("[StudyReport] AI generation failed:", err);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center" role="status">
        <div className="spinner w-12 h-12 mx-auto mb-6" />
        <h2 className="text-base font-semibold text-muted tracking-wider uppercase">Loading Analytics...</h2>
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-10 md:py-16 px-4 sm:px-6 animate-fade-in">
        <div className="surface rounded-2xl p-6 md:p-12 text-center relative overflow-hidden mb-8">
           <div className="absolute top-0 right-0 p-8 opacity-[0.06] hidden sm:block" aria-hidden="true">
              <Activity size={120} className="text-cardinal" />
           </div>
           <div className="w-16 h-16 bg-cardinal-soft rounded-2xl flex items-center justify-center mx-auto mb-6">
             <BarChart2 size={28} className="text-cardinal" />
           </div>
           <h2 className="text-3xl md:text-4xl font-extrabold mb-4 text-ink tracking-tight">Tracking Growth</h2>
           <p className="text-muted mb-8 max-w-sm mx-auto font-medium">Your performance dashboard will activate automatically as soon as your first challenge is completed and synced.</p>
           
           <div className="bg-canvas rounded-xl p-5 mb-8 max-w-md mx-auto border border-line">
              <p className="text-[10px] font-bold uppercase text-muted tracking-widest mb-3">Diagnostic Link</p>
              <div className="flex items-center justify-between gap-4 text-xs font-mono text-muted bg-surface border border-line p-3 rounded-lg">
                 <span className="truncate">Path: users/{getUserId()}/quizAttempts</span>
                 <button onClick={() => { navigator.clipboard.writeText(getUserId()); alert("User ID copied"); }} className="text-cardinal font-semibold hover:underline shrink-0 cursor-pointer">Copy</button>
              </div>
           </div>

           <div className="flex flex-col md:flex-row items-center justify-center gap-3">
              <button 
                 onClick={loadData}
                 className="btn-secondary w-full md:w-auto px-8 py-3.5 rounded-xl text-sm font-semibold"
              >
                 Force Sync Now
              </button>
              <button onClick={() => window.location.href = '/'} className="btn-primary w-full md:w-auto px-8 py-3.5 rounded-xl font-semibold text-sm">Start First Challenge →</button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 md:py-12 px-4 sm:px-6 animate-fade-in">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-ink tracking-tight leading-none mb-3">Study <span className="text-cardinal">Report</span></h1>
          <p className="text-muted font-medium flex items-center gap-2"><Activity size={18} className="text-cardinal shrink-0"/> Real-time performance analytics across all activity.</p>
        </div>
        <div className="flex items-center gap-3">
           <button type="button" onClick={loadData} className="btn-secondary px-5 py-2.5 rounded-lg text-sm font-semibold">
              <Clock size={14}/> Refresh Stats
           </button>
        </div>
      </div>

      <div className="surface rounded-2xl border border-line p-5 mb-8">
        <h3 className="text-sm font-extrabold uppercase tracking-wider mb-4 text-cardinal">Document-based learning insights</h3>
        {!docInsights ? (
          <p className="text-sm text-muted">Not enough practice data</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted text-xs uppercase font-bold">Uploads studied</div>
              <div className="text-2xl font-extrabold text-ink">{docInsights.uploads}</div>
            </div>
            <div>
              <div className="text-muted text-xs uppercase font-bold">Summaries saved</div>
              <div className="text-2xl font-extrabold text-ink">{docInsights.summaries}</div>
              <div className="text-[10px] text-muted mt-1">Summary alone ≠ mastery</div>
            </div>
            <div>
              <div className="text-muted text-xs uppercase font-bold">Open mistakes</div>
              <div className="text-2xl font-extrabold text-ink">{docInsights.mistakes}</div>
            </div>
            <div>
              <div className="text-muted text-xs uppercase font-bold">Flashcards reviewed</div>
              <div className="text-2xl font-extrabold text-ink">{summaryBridge.flashcardsReviewedCount || 0}</div>
            </div>
            <div className="col-span-2 md:col-span-4">
              <div className="text-muted text-xs uppercase font-bold mb-2">Frequently missed concepts</div>
              {docInsights.missedConcepts.length === 0 ? (
                <p className="text-muted">Not enough practice data</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {docInsights.missedConcepts.map((c) => (
                    <span key={c} className="px-3 py-1 rounded-full bg-danger-soft border border-danger/20 text-danger text-xs font-bold">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {metrics?.isEarly && (
        <div className="mb-6 rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-sm text-ink" role="status">
          <span className="font-semibold">Early practice results.</span> These numbers come from {metrics.totalQuizzes} quiz{metrics.totalQuizzes === 1 ? '' : 'zes'}.
          Take a few more to see a reliable trend. Quiz scores show practice results, not overall understanding.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-10">
        <div className="surface p-5 rounded-xl border-t-[3px] border-t-cardinal">
           <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-3">Quizzes taken</span>
           <div className="text-3xl md:text-4xl font-extrabold text-ink">{metrics?.totalQuizzes}</div>
        </div>
        <div className="surface p-5 rounded-xl">
           <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-3">Average quiz score</span>
           <div className="text-3xl md:text-4xl font-extrabold text-ink">{metrics?.avgAccuracy}%</div>
        </div>
        <div className="surface p-5 rounded-xl">
           <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-3">Latest vs. average</span>
           {metrics && metrics.trend !== null ? (
             <div className={`text-3xl md:text-4xl font-extrabold flex items-center gap-1 ${metrics.trend >= 0 ? 'text-success' : 'text-danger'}`}>
                {metrics.trend >= 0 ? <TrendingUp size={28}/> : <TrendingDown size={28}/>}
                {metrics.trend >= 0 ? '+' : '−'}{Math.abs(metrics.trend)}
             </div>
           ) : (
             <div>
               <div className="text-3xl md:text-4xl font-extrabold text-muted">—</div>
               <div className="text-[10px] text-muted mt-1">Needs 2+ quizzes</div>
             </div>
           )}
        </div>
        <div className="surface p-5 rounded-xl">
           <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-3">Best quiz</span>
           <div className="text-3xl md:text-4xl font-extrabold text-ink">{metrics?.bestScore}%</div>
        </div>
        <div className="surface p-5 rounded-xl">
           <span className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-3">Lowest quiz</span>
           <div className="text-3xl md:text-4xl font-extrabold text-muted">{metrics?.worstScore}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-12">
        <div className="lg:col-span-2 surface rounded-2xl p-5 md:p-8 pb-10 md:pb-12 relative">
           <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-8 flex items-center gap-2">
              <BarChart2 size={18} className="text-cardinal"/> Performance Over Time
           </h3>
           <ProgressChart data={attempts} />
        </div>

        <div className="surface rounded-2xl p-5 md:p-8">
           <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-2 flex items-center gap-2">
              <Target size={18} className="text-gold-ink"/> Results by topic
           </h3>
           <p className="text-[11px] text-muted mb-5">Correct out of answered questions. Unanswered questions are listed separately.</p>
           <div className="space-y-5">
              {(metrics?.academicTopics || []).slice(0, 6).map((t) => (
                <div key={t.name}>
                   <div className="flex justify-between gap-3 text-sm font-semibold text-ink mb-1">
                      <span className="truncate">{t.name}</span>
                      <span className="shrink-0">{t.accuracy === null ? 'Not assessed' : `${t.correct}/${t.answered}`}</span>
                   </div>
                   {t.accuracy !== null && (
                     <div className="w-full h-2 bg-sunken rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${t.accuracy}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className={`h-full rounded-full ${t.accuracy >= 70 ? 'bg-success' : 'bg-warning'}`}
                        />
                     </div>
                   )}
                   {t.unanswered > 0 && (
                     <p className="text-[11px] text-muted mt-1">{t.unanswered} unanswered</p>
                   )}
                </div>
              ))}
              {(metrics?.academicTopics.length ?? 0) === 0 && (
                <p className="text-sm text-muted">No course topics assessed yet.</p>
              )}
           </div>
           {(metrics?.policyTopics.length ?? 0) > 0 && (
             <div className="mt-6 pt-4 border-t border-line">
               <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Course policy quizzes</p>
               <ul className="space-y-1 text-xs text-muted">
                 {metrics!.policyTopics.slice(0, 4).map((t) => (
                   <li key={t.name} className="flex justify-between gap-3">
                     <span className="truncate">{t.name.replace(/^Course policies\s*·\s*/i, '')}</span>
                     <span className="shrink-0">{t.accuracy === null ? 'Not assessed' : `${t.correct}/${t.answered}`}</span>
                   </li>
                 ))}
               </ul>
               <p className="text-[10px] text-muted mt-2">Not used for study recommendations.</p>
             </div>
           )}
        </div>
      </div>

      <section className="mb-12">
        <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-5 pb-3 border-b border-line flex items-center gap-2">
          <Calendar size={18} className="text-cardinal"/> Attempt History
        </h3>
        <div className="grid grid-cols-1 gap-3">
          {attempts.map((attempt) => (
            <QuizAttemptCard key={attempt.id} attempt={attempt} />
          ))}
        </div>
      </section>

      <section className="mt-14">
        <div className="surface rounded-2xl p-6 md:p-12 text-center relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-[0.06] hidden sm:block" aria-hidden="true">
              <Brain size={120} className="text-cardinal" />
           </div>
           <h2 className="eyebrow mb-3">Claude Reasoning Engine</h2>
           <h3 className="text-2xl md:text-3xl font-extrabold text-ink mb-6 tracking-tight">Behavioral Analysis</h3>
           
           {!aiReport ? (
             <div className="py-4">
               <p className="text-muted mb-8 max-w-md mx-auto">Claude can analyze your history to detect complex patterns, recurring misconceptions, and deep growth areas.</p>
               <button 
                 onClick={handleGenerateAiInsights}
                 disabled={isGeneratingAi}
                 type="button"
                 className="btn-primary px-8 py-3.5 rounded-xl font-semibold text-sm"
               >
                 {isGeneratingAi ? "Analyzing History..." : "Generate AI Insights"}
               </button>
             </div>
           ) : (
             <div className="max-w-2xl mx-auto text-left">
                <div className="bg-canvas rounded-xl p-5 md:p-8 border border-line border-l-4 border-l-gold whitespace-pre-wrap text-ink leading-relaxed">
                   {aiReport}
                </div>
                <button 
                   onClick={() => setAiReport(null)}
                   className="btn-link mt-5 text-xs uppercase tracking-wider"
                >
                   Clear Analysis
                </button>
             </div>
           )}
        </div>
      </section>
    </div>
  );
};

export default StudyReport;
