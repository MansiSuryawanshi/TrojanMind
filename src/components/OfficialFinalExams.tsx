import React, { useCallback, useEffect, useState } from 'react';
import { useBrightspace } from '../brightspace/useBrightspace';
import type { OfficialFinal } from '../brightspace/brightspaceContext';

interface Props {
  /** Currently set exam date (YYYY-MM-DD), if any. */
  examDate: string | null;
  onUseDate: (isoDate: string) => void;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; finals: OfficialFinal[]; sources: { label: string; url: string }[] }
  | { kind: 'error'; message: string };

const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "20263 CSCI-561: Foundations of AI" → "Foundations of AI". */
const courseTitle = (name: string) => name.replace(/^[\d_]+\s+/, '').replace(/^[A-Z]{2,5}-\d{3}[A-Z]?:\s*/, '');

/**
 * Final exam slots from USC's official final examination schedule, matched to
 * each current-term Brightspace course's section meeting time.
 */
export const OfficialFinalExams: React.FC<Props> = ({ examDate, onUseDate }) => {
  const { connection, fetchOfficialFinals } = useBrightspace();
  const connected = connection.method === 'local_demo' && connection.state === 'connected';
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const fetchFinals = useCallback((signal?: AbortSignal) =>
    fetchOfficialFinals(signal)
      .then((r) => setLoad(r.ok ? { kind: 'ready', finals: r.finals, sources: r.sources } : { kind: 'error', message: r.message }))
      .catch(() => { /* aborted */ }), [fetchOfficialFinals]);

  const refresh = () => {
    setLoad({ kind: 'loading' });
    void fetchFinals();
  };

  useEffect(() => {
    if (!connected) return;
    const ac = new AbortController();
    void fetchFinals(ac.signal);
    return () => ac.abort();
  }, [connected, fetchFinals]);

  if (!connected) return null;

  const finals = load.kind === 'ready'
    ? [...load.finals].sort((a, b) => (a.exam?.date ?? '9999').localeCompare(b.exam?.date ?? '9999') || (a.exam?.start ?? '').localeCompare(b.exam?.start ?? ''))
    : [];

  return (
    <section className="ep-bs-dates" aria-labelledby="ep-finals-title">
      <div className="ep-bs-head">
        <h2 id="ep-finals-title" className="ep-bs-title">Official final exams</h2>
        <button type="button" className="ep-bs-refresh" onClick={refresh} disabled={load.kind === 'loading'}>
          {load.kind === 'loading' ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {load.kind === 'error' && <p className="ep-bs-note" role="alert">{load.message}</p>}
      {load.kind === 'ready' && finals.length === 0 && (
        <p className="ep-bs-note">None of your Brightspace courses are in a term with a published USC final exam schedule.</p>
      )}

      {finals.length > 0 && (
        <ul className="ep-bs-list">
          {finals.map((f) => {
            const active = f.exam?.date === examDate;
            return (
              <li key={f.courseId} className={`ep-bs-item${active ? ' is-active' : ''}`}>
                <div className="ep-bs-main">
                  <span className="ep-bs-kind ep-bs-kind-exam">{f.courseCode}</span>
                  <span className="ep-bs-name">
                    {f.exam ? `${fmtDay(f.exam.date)} · ${fmtTime(f.exam.start)}–${fmtTime(f.exam.end)}` : 'Not determined'}
                  </span>
                  <span className="ep-bs-meta">
                    {courseTitle(f.courseName)}
                    {f.exam
                      ? ` · Based on the official USC final exam schedule${f.meeting ? ` and your weekly class time (${f.meeting})` : ''}. Please confirm with your professor.`
                      : f.reason ? ` · ${f.reason}` : ''}
                  </span>
                </div>
                {f.exam && (active ? (
                  <span className="ep-bs-current">Current target</span>
                ) : (
                  <button type="button" className="ep-bs-use" onClick={() => onUseDate(f.exam!.date)}>
                    Use this date
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      {load.kind === 'ready' && finals.length > 0 && (
        <p className="ep-bs-note ep-bs-foot">
          These dates are worked out from the{' '}
          {load.sources.map((s, i) => (
            <React.Fragment key={s.url}>
              {i > 0 && ', '}
              <a href={s.url} target="_blank" rel="noopener noreferrer">official USC {s.label} final examination schedule</a>
            </React.Fragment>
          ))}
          {' '}and the day and time your class meets each week (USC Schedule of Classes). Times are Los Angeles time.
          {' '}<strong>Please confirm the date with your professor</strong>: some courses hold a project, presentation, or a
          different exam time instead.
        </p>
      )}
    </section>
  );
};
