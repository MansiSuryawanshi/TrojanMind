import React from 'react';
import type { StudyReport } from '../types/report';

interface ReportHeaderProps {
  report: StudyReport;
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 75
      ? 'bg-success-soft text-success border-success/25'
      : score >= 50
      ? 'bg-gold-soft text-ink border-gold/60'
      : 'bg-danger-soft text-danger border-danger/25';
  return (
    <div
      className={`w-16 h-16 rounded-2xl border flex items-center justify-center text-2xl font-bold shrink-0 ${cls}`}
    >
      {score}
    </div>
  );
}

function formatTime(date: Date | null): string {
  if (!date) return 'today';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({ report }) => {
  return (
    <div className="mb-6">
      {/* Title row */}
      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-2xl font-bold text-ink m-0">
            Study <span className="text-cardinal">Report</span>
          </h2>
          <p className="text-muted text-sm mt-1">
            Generated today at {formatTime(report.createdAt)}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="btn-secondary px-4 py-2 rounded-lg text-sm font-semibold"
        >
          Download
        </button>
      </div>

      {/* Overall score */}
      <div className="flex items-center gap-4 mb-4">
        <ScoreBadge score={report.overallScore} />
        <div>
          <p className="text-xs text-muted font-medium mb-1">Overall score</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink">
              Predicted exam:{' '}
              <strong className="text-ink">{report.predictedExamScore}/100</strong>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-sunken text-muted">
              {report.confidenceCalibration}
            </span>
          </div>
        </div>
      </div>

      {/* Strength */}
      <div className="p-3 rounded-xl bg-success-soft border border-success/20 text-sm text-ink mb-2">
        <strong className="text-success">Top strength:</strong> {report.topStrength}
      </div>

      {/* Weakness */}
      <div className="p-3 rounded-xl bg-danger-soft border border-danger/20 text-sm text-ink">
        <strong className="text-danger">Top weakness:</strong> {report.topWeakness}
      </div>
    </div>
  );
};
