/**
 * Three metric summary cards — driven by props from StudySchedule.
 */
import React from 'react';

interface MetricsRowProps {
  challengesDone: number;
  avgScore: number;
  gapsCount: number;
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

export const MetricsRow: React.FC<MetricsRowProps> = ({ challengesDone, avgScore, gapsCount }) => {
  return (
    <div className="flex gap-3 sm:gap-4 mb-8">
      <MetricCard icon="🎯" label="Challenges done"   value={challengesDone} />
      <MetricCard icon="🧠" label="Avg understanding" value={avgScore} sub="/100" />
      <MetricCard icon="⚡" label="Gaps to close"     value={gapsCount} />
    </div>
  );
};
