import React from 'react';
import type { ReportSection } from '../types/report';

interface ReportScoreGridProps {
  sections: ReportSection[];
}

function scoreClasses(score: number): string {
  if (score >= 75) return 'bg-success-soft text-success border-success/25';
  if (score >= 50) return 'bg-gold-soft text-ink border-gold/60';
  return 'bg-danger-soft text-danger border-danger/25';
}

export const ReportScoreGrid: React.FC<ReportScoreGridProps> = ({ sections }) => {
  const scrollTo = (title: string) => {
    document.getElementById(`section-${title}`)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      {sections.map((section) => (
        <button
          key={section.title}
          onClick={() => scrollTo(section.title)}
          className="surface rounded-xl p-4 text-left cursor-pointer hover:border-cardinal/40 transition-colors"
        >
          <p className="text-xs text-muted mb-2">{section.title}</p>
          <span
            className={`inline-block text-2xl font-bold px-2.5 py-0.5 rounded-lg border ${scoreClasses(section.score)}`}
          >
            {section.score}
          </span>
          <p className="text-xs text-muted mt-2 leading-snug line-clamp-2">
            {section.summary.split('.')[0]}.
          </p>
        </button>
      ))}
    </div>
  );
};
