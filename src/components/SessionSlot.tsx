/**
 * Reusable session row inside DayScheduleCard.
 * Shows: time | label + topic pill | duration badge
 */
import React from 'react';
import type { BadgeType } from '../types';

interface SessionSlotProps {
  time: string;
  label: string;
  topicTag: string;
  duration: string;
  badgeType: BadgeType;
  rationale?: string | null;
  isLast?: boolean;
}

const BADGE_CLASSES: Record<BadgeType, string> = {
  coral:  'bg-danger-soft text-danger border border-danger/20',
  purple: 'bg-cardinal-soft text-cardinal border border-cardinal/20',
  teal:   'bg-success-soft text-success border border-success/20',
};

const BADGE_LABELS: Record<BadgeType, string> = {
  coral:  'gap focus',
  purple: 'challenge',
  teal:   'review',
};

export const SessionSlot: React.FC<SessionSlotProps> = ({
  time,
  label,
  topicTag,
  duration,
  badgeType,
  rationale,
  isLast = false,
}) => {
  return (
    <div
      className={`flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 py-3 ${
        !isLast ? 'border-b border-line' : ''
      }`}
    >
      {/* Time */}
      <span className="min-w-[60px] text-xs text-muted tabular-nums shrink-0">
        {time}
      </span>

      {/* Label + topic pill + Rationale */}
      <div className="flex-1 min-w-0 flex flex-col gap-1 justify-center">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-ink font-medium leading-none">{label}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-sunken text-muted whitespace-nowrap">
            {topicTag}
          </span>
        </div>
        
        {/* Factual rationale (if exists) */}
        {rationale && (
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <span className="text-[10px] text-muted uppercase tracking-wider font-bold">Evidence:</span>
            <span className="text-[11px] text-muted italic truncate">
              {rationale}
            </span>
          </div>
        )}
      </div>

      {/* Badge + duration */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${BADGE_CLASSES[badgeType]}`}>
          {BADGE_LABELS[badgeType]}
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-sunken text-muted">
          {duration}
        </span>
      </div>
    </div>
  );
};
