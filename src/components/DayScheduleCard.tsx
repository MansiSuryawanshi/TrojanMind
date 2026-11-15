/**
 * Card for one day's study sessions — shows weekday + calendar date.
 */
import React, { useState } from 'react';
import type { DaySchedule } from '../types';
import { SessionSlot } from './SessionSlot';

interface DayScheduleCardProps {
  day: DaySchedule;
  /** Called when the student edits a session's estimated minutes. */
  onDurationChange?: (sessionIndex: number, minutes: number) => void;
}

function formatPrettyDate(iso?: string): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const DayScheduleCard: React.FC<DayScheduleCardProps> = ({ day, onDurationChange }) => {
  const [collapsed, setCollapsed] = useState(false);
  const pretty = formatPrettyDate(day.date);

  return (
    <div className="surface rounded-xl overflow-hidden transition-colors duration-200 hover:border-line-strong">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-4 cursor-pointer text-left hover:bg-canvas"
      >
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <div className="min-w-0">
            <div className="text-sm font-bold text-ink leading-snug">{day.day}</div>
            {(pretty || day.date) && (
              <div className="text-xs text-cardinal font-semibold mt-0.5 tabular-nums">
                {pretty || day.date}
                {day.date && pretty ? (
                  <span className="text-muted font-medium"> · {day.date}</span>
                ) : null}
              </div>
            )}
          </div>
          <span className="text-xs text-muted px-2 py-0.5 rounded-full bg-sunken">
            {day.sessions.length} session{day.sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <span
          aria-hidden="true"
          className={`text-muted text-xs transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
        >
          ▲
        </span>
      </button>

      {!collapsed && (
        <div className="px-4 sm:px-5 pb-3 border-t border-line">
          {day.sessions.map((session, i) => (
            <SessionSlot
              key={i}
              time={session.time}
              label={session.label}
              topicTag={session.topic_tag}
              duration={session.duration}
              badgeType={session.badge_type}
              rationale={session.rationale}
              whatToStudy={session.what_to_study}
              studySteps={session.study_steps}
              resources={session.resources}
              isLast={i === day.sessions.length - 1}
              onDurationChange={onDurationChange ? (m) => onDurationChange(i, m) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
};
