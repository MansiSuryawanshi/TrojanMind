import React from 'react';
import type { ReportSection } from '../types/report';

interface ReportSectionCardProps {
  section: ReportSection;
}

function scoreClasses(score: number): string {
  if (score >= 75) return 'bg-success-soft text-success border-success/25';
  if (score >= 50) return 'bg-gold-soft text-ink border-gold/60';
  return 'bg-danger-soft text-danger border-danger/25';
}

export const ReportSectionCard: React.FC<ReportSectionCardProps> = ({ section }) => {
  return (
    <div id={`section-${section.title}`} className="surface rounded-xl p-5 mb-3">
      {/* Title + score badge */}
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm font-semibold text-ink m-0">{section.title}</p>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full border ${scoreClasses(section.score)}`}
        >
          {section.score}/100
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm text-muted leading-relaxed mb-3">{section.summary}</p>

      {/* Key findings */}
      <ul className="space-y-1.5 mb-3 p-0 list-none">
        {section.keyFindings.map((finding, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted leading-snug">
            <span className="text-gold-ink font-bold shrink-0 mt-0.5">•</span>
            {finding}
          </li>
        ))}
      </ul>

      {/* Recommendation */}
      <div className="p-3 rounded-xl bg-cardinal-soft border border-cardinal/20 text-sm text-ink leading-relaxed">
        <strong className="text-cardinal">Recommendation:</strong> {section.recommendation}
      </div>
    </div>
  );
};
