/**
 * Three metric summary cards — driven by props from StudySchedule.
 */
import React from 'react';

interface MetricsRowProps {
  quizzesTaken: number;
  /** Plain average of recorded quiz scores, in percent. */
  avgScore: number;
  /** Assessed academic topics with missed questions. */
  topicsToReview: number;
  /** Too few quizzes to call it a trend. */
  isEarly: boolean;
}

function MetricCard({ label, value, sub, icon }: { label: string; value: number; sub?: string; icon: string }) {
  return (
    <div className="surface flex-1 min-w-0 rounded-xl p-4 sm:p-5 text-center">
      <div className="text-xl sm:text-2xl mb-2" aria-hidden="true">{icon}</div>
      <div className="text-2xl sm:text-3xl font-extrabold text-ink leading-tight tracking-tight">
        {value}
        {sub && <span className="text-sm font-normal text-muted ml-1">{sub}</span>}
      </div>
      <div className="text-xs text-muted mt-1 font-medium">{label}</div>
    </div>
  );
}

export const MetricsRow: React.FC<MetricsRowProps> = ({ quizzesTaken, avgScore, topicsToReview, isEarly }) => {
  return (
    <div className="mb-8">
      <div className="flex gap-3 sm:gap-4">
        <MetricCard icon="🎯" label="Quizzes taken" value={quizzesTaken} />
        <MetricCard icon="📝" label="Average quiz score" value={avgScore} sub="%" />
        <MetricCard icon="🔁" label="Topics to review" value={topicsToReview} />
      </div>
      {isEarly && (
        <p className="text-xs text-muted mt-3 text-center">
          Early practice results from {quizzesTaken} quiz{quizzesTaken === 1 ? '' : 'zes'}. A few more quizzes are needed
          to see a reliable trend.
        </p>
      )}
    </div>
  );
};
