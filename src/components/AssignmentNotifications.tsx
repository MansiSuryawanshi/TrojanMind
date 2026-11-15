import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ExternalLink, RefreshCw } from 'lucide-react';
import { useBrightspace } from '../brightspace/useBrightspace';
import type { UpcomingDate } from '../brightspace/brightspaceContext';

const SEEN_KEY = 'tm.assignmentNotice.seen';
const DAY = 24 * 60 * 60 * 1000;

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; items: UpcomingDate[] }
  | { kind: 'error'; message: string };

type Urgency = 'overdue' | 'urgent' | 'soon' | 'later';

function urgencyOf(due: number, now: number): Urgency {
  const diff = due - now;
  if (diff < 0) return 'overdue';
  if (diff <= 2 * DAY) return 'urgent';
  if (diff <= 7 * DAY) return 'soon';
  return 'later';
}

/** "in 3 hours", "tomorrow", "in 5 days". */
function relative(due: number, now: number): string {
  const diff = due - now;
  if (diff < 0) return 'past due';
  const hours = Math.round(diff / (60 * 60 * 1000));
  if (hours < 1) return 'within the hour';
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(diff / DAY);
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

const fmt = (instant: string) =>
  new Date(instant).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "20263_30130 CSCI-526: Advanced Mobile…" → "CSCI-526". */
const courseCode = (name: string | null) => {
  if (!name) return null;
  const stripped = name.replace(/^\d{5}(_\d+)?\s+/, '');
  return stripped.split(':')[0].trim() || stripped;
};

const readSeen = (): string | null => {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
};
const writeSeen = (sig: string) => {
  try { localStorage.setItem(SEEN_KEY, sig); } catch { /* storage blocked */ }
};

/**
 * Navbar bell listing Brightspace assignments due in the next 90 days.
 * Renders nothing unless the local Brightspace connection is up. The badge
 * shows until the list is opened, and comes back when the set changes.
 */
export const AssignmentNotifications: React.FC = () => {
  const { connection, fetchUpcomingDates } = useBrightspace();
  const connected = connection.method === 'local_demo' && connection.state === 'connected';
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(readSeen);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback((signal?: AbortSignal) =>
    fetchUpcomingDates(signal)
      .then((r) => {
        setNow(Date.now());
        if (!r.ok) { setLoad({ kind: 'error', message: r.message }); return; }
        // Calendar events can mirror a dropbox due date; keep one per course + title.
        const dedupe = new Set<string>();
        const items = r.dates.filter((d) => {
          if (d.source !== 'assignment') return false;
          const key = `${d.courseId}|${d.title.toLowerCase()}`;
          if (dedupe.has(key)) return false;
          dedupe.add(key);
          return true;
        });
        setLoad({ kind: 'ready', items });
      })
      .catch(() => { /* aborted */ }), [fetchUpcomingDates]);

  useEffect(() => {
    if (!connected) return;
    const ac = new AbortController();
    void fetchItems(ac.signal);
    return () => ac.abort();
  }, [connected, fetchItems]);

  // Keep the "in N hours" labels fresh while the page stays open.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = useMemo(() => (load.kind === 'ready' ? load.items : []), [load]);
  const signature = useMemo(() => items.map((i) => i.id).sort().join(','), [items]);

  if (!connected) return null;

  const urgentCount = items.filter((i) => {
    const u = urgencyOf(Date.parse(i.date), now);
    return u === 'urgent' || u === 'overdue';
  }).length;
  const unseen = items.length > 0 && seen !== signature;

  const toggle = () => {
    if (!open && items.length > 0) { writeSeen(signature); setSeen(signature); }
    setOpen((v) => !v);
  };

  const refresh = () => {
    setLoad({ kind: 'loading' });
    void fetchItems();
  };

  const label = load.kind === 'ready'
    ? `Upcoming assignments: ${items.length}${unseen ? ', new' : ''}`
    : 'Upcoming assignments';

  return (
    <div className="tm-bell" ref={rootRef}>
      <button
        type="button"
        className={`tm-bell-btn${open ? ' is-open' : ''}`}
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Upcoming assignments"
      >
        <Bell size={18} aria-hidden="true" />
        {unseen && (
          <span className={`tm-bell-badge${urgentCount > 0 ? ' is-urgent' : ''}`} aria-hidden="true">
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="tm-bell-panel" role="dialog" aria-label="Upcoming assignments">
          <div className="tm-bell-head">
            <div>
              <p className="tm-bell-title">Upcoming assignments</p>
              <p className="tm-bell-sub">From Brightspace · next 90 days</p>
            </div>
            <button type="button" className="tm-notice-icon-btn" onClick={refresh} aria-label="Refresh assignments" title="Refresh">
              <RefreshCw size={15} aria-hidden="true" className={load.kind === 'loading' ? 'animate-spin' : undefined} />
            </button>
          </div>

          {load.kind === 'loading' && <p className="tm-bell-empty">Loading…</p>}
          {load.kind === 'error' && (
            <p className="tm-bell-empty">Couldn't load due dates from Brightspace.{load.message ? ` ${load.message}` : ''}</p>
          )}
          {load.kind === 'ready' && items.length === 0 && <p className="tm-bell-empty">Nothing due in the next 90 days.</p>}

          {items.length > 0 && (
            <ul className="tm-bell-list">
              {items.map((a) => {
                const due = Date.parse(a.date);
                const u = urgencyOf(due, now);
                const code = courseCode(a.courseName);
                return (
                  <li key={a.id} className="tm-bell-item">
                    <span className={`tm-notice-pill is-${u}`}>{relative(due, now)}</span>
                    <div className="tm-notice-main">
                      <span className="tm-notice-name">
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noopener noreferrer">
                            {a.title}
                            <ExternalLink size={12} aria-hidden="true" className="tm-notice-ext" />
                            <span className="sr-only"> (opens Brightspace in a new tab)</span>
                          </a>
                        ) : a.title}
                      </span>
                      <span className="tm-notice-meta">
                        {code ? <>{code} · </> : null}Due {fmt(a.date)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default AssignmentNotifications;

