/**
 * Score card for one student: animated bars per dimension, misconception badge, winner border.
 * Owner: Developer 1 (Frontend UI)
 */
import React, { useEffect, useState } from 'react';
import type { StudentScore } from '../types';

interface ScoreCardProps {
  studentLabel: string;
  scores: StudentScore;
  isWinner: boolean;
}

const barColor = (score: number): string => {
  if (score > 7) return 'var(--color-success)';
  if (score >= 4) return 'var(--color-warning)';
  return 'var(--color-danger)';
};

const DIMENSIONS: {
  key: keyof Pick<StudentScore, 'correctness' | 'reasoning_depth' | 'clarity'>;
  label: string;
}[] = [
  { key: 'correctness',     label: 'Correctness' },
  { key: 'reasoning_depth', label: 'Reasoning Depth' },
  { key: 'clarity',         label: 'Clarity' },
];

const ScoreCard: React.FC<ScoreCardProps> = ({ studentLabel, scores, isWinner }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const inner = (
    <div className="surface rounded-2xl p-4 flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink text-sm">{studentLabel}</span>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
            isWinner ? 'bg-gold text-ink border-gold' : 'bg-sunken text-ink border-line'
          }`}
        >
          {scores.total} / 100
        </span>
      </div>

      {/* Animated bars */}
      <div className="flex flex-col gap-3">
        {DIMENSIONS.map(({ key, label }) => {
          const val = scores[key];
          return (
            <div key={key} className="flex items-center gap-3">
              <span
                className="text-xs font-medium text-muted shrink-0"
                style={{ width: 110 }}
              >
                {label}
              </span>
              <div
                className="flex-1 rounded-full h-2 overflow-hidden bg-sunken"
              >
                <div
                  className="h-2 rounded-full transition-all duration-[800ms] ease-out"
                  style={{
                    width: mounted ? `${val * 10}%` : '0%',
                    backgroundColor: barColor(val),
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-ink shrink-0 w-5 text-right">
                {val}
              </span>
            </div>
          );
        })}
      </div>

      {/* Misconception */}
      {scores.misconception_present ? (
        <p className="text-xs font-medium text-danger">
          Misconception:{' '}
          <span className="font-semibold">{scores.misconception_name ?? 'Unspecified'}</span>
        </p>
      ) : (
        <p className="text-xs font-medium text-success">✓ No misconceptions detected</p>
      )}
    </div>
  );

  // Winner gets a cardinal outline
  if (isWinner) {
    return (
      <div className="rounded-2xl h-full ring-2 ring-cardinal">
        {inner}
      </div>
    );
  }

  return inner;
};

export default ScoreCard;
