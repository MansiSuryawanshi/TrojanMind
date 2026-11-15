/**
 * Card for one day's study sessions.
 */
import React, { useState } from 'react';
import type { DaySchedule } from '../types';
import { SessionSlot } from './SessionSlot';

interface DayScheduleCardProps {
  day: DaySchedule;
}

export const DayScheduleCard: React.FC<DayScheduleCardProps> = ({ day }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="surface rounded-xl overflow-hidden transition-colors duration-200 hover:border-line-strong">
      {/* Day header */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-4 cursor-pointer text-left hover:bg-canvas"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-ink">{day.day}</span>
          <span className="text-xs text-muted px-2 py-0.5 rounded-full bg-sunken">{day.sessions.length} session{day.sessions.length !== 1 ? 's' : ''}</span>
        </div>
        <span aria-hidden="true" className={`text-muted text-xs transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}>
          ▲
        </span>
      </button>

      {/* Sessions */}
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
              isLast={i === day.sessions.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};
