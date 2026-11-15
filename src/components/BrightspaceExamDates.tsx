import React, { useCallback, useEffect, useState } from 'react';
import { useBrightspace } from '../brightspace/useBrightspace';
import type { UpcomingDate } from '../brightspace/brightspaceContext';

interface Props {
  /** Currently set exam date (YYYY-MM-DD), if any. */
  examDate: string | null;
  /** Apply a Brightspace date as the exam date (YYYY-MM-DD, local). */
  onUseDate: (isoDate: string) => void;
}

/** YYYY-MM-DD in the viewer's local time zone. */
function toLocalIsoDate(instant: string): string {
  const d = new Date(instant);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const fmt = (instant: string) =>
  new Date(instant).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Strip the term prefix Brightspace puts on course names ("20263 CSCI-561: …" → "CSCI-561: …"). */
const shortCourse = (name: string | null) => (name ? name.replace(/^\d{5}(_\d+)?\s+/, '') : null);

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; dates: UpcomingDate[] }
  | { kind: 'error'; message: string };

/**
 * Exams and quizzes from the user's Brightspace calendar and due dates
 * (next 90 days), with a one-click way to make one the Exam Prep target.
 * Renders nothing unless the local Brightspace connection is up.
 */
export const BrightspaceExamDates: React.FC<Props> = ({ examDate, onUseDate }) => {
  const { connection, fetchUpcomingDates } = useBrightspace();
  const connected = connection.method === 'local_demo' && connection.state === 'connected';
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const load_ = useCallback((signal?: AbortSignal) =>
    fetchUpcomingDates(signal)
      .then((r) => setLoad(r.ok ? { kind: 'ready', dates: r.dates } : { kind: 'error', message: r.message }))
      .catch(() => { /* aborted */ }), [fetchUpcomingDates]);

  const run = () => {
    setLoad({ kind: 'loading' });
    void load_();
  };

  useEffect(() => {
    if (!connected) return;
    const ac = new AbortController();
    void load_(ac.signal);
    return () => ac.abort();
  }, [connected, load_]);

  if (!connected) return null;

  // The connector only returns upcoming items, so no date filter is needed here.
  const assessments = load.kind === 'ready' ? load.dates.filter((d) => d.kind !== 'other') : [];
  const otherCount = load.kind === 'ready' ? load.dates.length - assessments.length : 0;

  return (
    <section className="ep-bs-dates" aria-labelledby="ep-bs-dates-title">
      <div className="ep-bs-head">
        <h2 id="ep-bs-dates-title" className="ep-bs-title">Exams from Brightspace</h2>
        <button type="button" className="ep-bs-refresh" onClick={() => run()} disabled={load.kind === 'loading'}>
          {load.kind === 'loading' ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {load.kind === 'error' && <p className="ep-bs-note" role="alert">{load.message}</p>}

      {load.kind === 'ready' && assessments.length === 0 && (
        <p className="ep-bs-note">
          No exams or quizzes on your Brightspace calendar in the next 90 days
          {otherCount > 0 ? ` (${otherCount} other deadline${otherCount === 1 ? '' : 's'} found)` : ''}.
          Set your exam date manually with the box above.
        </p>
      )}

      {assessments.length > 0 && (
        <ul className="ep-bs-list">
          {assessments.map((d) => {
            const iso = toLocalIsoDate(d.date);
            const active = iso === examDate;
            return (
              <li key={d.id} className={`ep-bs-item${active ? ' is-active' : ''}`}>
                <div className="ep-bs-main">
                  <span className={`ep-bs-kind ep-bs-kind-${d.kind}`}>{d.kind === 'exam' ? 'Exam' : 'Quiz'}</span>
                  <span className="ep-bs-name">
                    {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a> : d.title}
                  </span>
                  <span className="ep-bs-meta">
                    {fmt(d.date)}{d.courseName ? ` · ${shortCourse(d.courseName)}` : ''}
                  </span>
                </div>
                {active ? (
                  <span className="ep-bs-current">Current target</span>
                ) : (
                  <button type="button" className="ep-bs-use" onClick={() => onUseDate(iso)}>
                    Use this date
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
