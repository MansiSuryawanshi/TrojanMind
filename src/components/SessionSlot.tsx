/**
 * Reusable session row inside DayScheduleCard.
 * Shows time, focus, steps, and study resources (incl. online articles).
 */
import React, { useState } from 'react';
import type { BadgeType, StudyResource } from '../types';

interface SessionSlotProps {
  time: string;
  label: string;
  topicTag: string;
  duration: string;
  badgeType: BadgeType;
  rationale?: string | null;
  whatToStudy?: string | null;
  studySteps?: string[];
  resources?: StudyResource[];
  isLast?: boolean;
  onDurationChange?: (minutes: number) => void;
}

const BADGE_CLASSES: Record<BadgeType, string> = {
  coral: 'bg-danger-soft text-danger border border-danger/20',
  purple: 'bg-cardinal-soft text-cardinal border border-cardinal/20',
  teal: 'bg-success-soft text-success border border-success/20',
};

const BADGE_LABELS: Record<BadgeType, string> = {
  coral: 'gap focus',
  purple: 'challenge',
  teal: 'review',
};

const RESOURCE_LABELS: Record<string, string> = {
  article: 'Article',
  video: 'Video',
  docs: 'Docs',
  uploaded_material: 'Your material',
  practice: 'Practice',
  other: 'Resource',
};

export const SessionSlot: React.FC<SessionSlotProps> = ({
  time,
  label,
  topicTag,
  duration,
  badgeType,
  rationale,
  whatToStudy,
  studySteps,
  resources,
  isLast = false,
  onDurationChange,
}) => {
  const minutes = Number.parseInt(duration, 10);
  const [expanded, setExpanded] = useState(true);
  const hasDetail =
    Boolean(whatToStudy?.trim()) ||
    (studySteps && studySteps.length > 0) ||
    (resources && resources.length > 0);

  return (
    <div
      className={`py-3 ${!isLast ? 'border-b border-line' : ''}`}
    >
      <div className="flex flex-wrap sm:flex-nowrap items-start gap-x-3 gap-y-1.5">
        <span className="min-w-[60px] text-xs text-muted tabular-nums shrink-0 pt-0.5">
          {time}
        </span>

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-ink font-medium leading-snug">{label}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-sunken text-muted whitespace-nowrap">
              {topicTag}
            </span>
          </div>

          {rationale && (
            <p className="text-[11px] text-muted italic leading-snug">
              <span className="not-italic font-bold uppercase tracking-wider text-[10px] text-muted">
                Why:{' '}
              </span>
              {rationale}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${BADGE_CLASSES[badgeType]}`}>
            {BADGE_LABELS[badgeType]}
          </span>
          {onDurationChange && Number.isFinite(minutes) ? (
            <label className="text-[11px] px-2 py-0.5 rounded-full bg-sunken text-muted inline-flex items-center gap-1">
              Est.
              <input
                type="number"
                min={5}
                max={240}
                step={5}
                defaultValue={minutes}
                onBlur={(e) => {
                  const v = Math.max(5, Math.min(240, Number(e.target.value) || minutes));
                  if (v !== minutes) onDurationChange(v);
                }}
                className="w-11 bg-transparent text-ink text-[11px] tabular-nums focus:outline-none"
                aria-label={`Estimated minutes for ${label}`}
              />
              min
            </label>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-sunken text-muted">Est. {duration}</span>
          )}
          {hasDetail && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[11px] px-2 py-0.5 rounded-full border border-line text-muted hover:text-ink hover:border-line-strong"
              aria-expanded={expanded}
            >
              {expanded ? 'Hide plan' : 'Study plan'}
            </button>
          )}
        </div>
      </div>

      {hasDetail && expanded && (
        <div className="mt-3 ml-0 sm:ml-[72px] space-y-3 rounded-xl bg-sunken/70 border border-line p-3.5">
          {whatToStudy?.trim() && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-cardinal mb-1">
                What to study
              </p>
              <p className="text-sm text-ink leading-relaxed">{whatToStudy}</p>
            </div>
          )}

          {studySteps && studySteps.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-cardinal mb-1.5">
                How to study
              </p>
              <ol className="list-decimal list-inside space-y-1">
                {studySteps.map((step, i) => (
                  <li key={i} className="text-sm text-ink leading-snug">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {resources && resources.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-cardinal mb-1.5">
                Where to study from
              </p>
              <p className="text-[11px] text-muted mb-1.5">
                “Your material” is text you imported into TrojanMind. Links open external pages and aren’t imported.
              </p>
              <ul className="space-y-2">
                {resources.map((r, i) => (
                  <li
                    key={`${r.title}-${i}`}
                    className="rounded-lg bg-surface border border-line px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cardinal-soft text-cardinal">
                        {RESOURCE_LABELS[r.type] || 'Resource'}
                      </span>
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-cardinal hover:underline break-words"
                        >
                          {r.title}
                        </a>
                      ) : (
                        <span className="text-sm font-semibold text-ink">{r.title}</span>
                      )}
                    </div>
                    {r.why && (
                      <p className="text-[11px] text-muted leading-snug">{r.why}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
