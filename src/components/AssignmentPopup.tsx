import React, { useEffect, useState } from 'react';
import { BellRing, Clock, X } from 'lucide-react';

/** Set to false to turn the demo popups off. */
export const SHOW_DEMO_ASSIGNMENT_POPUP = true;

interface DemoAssignment {
  id: string;
  title: string;
  course: string;
  due: Date;
}

/** Tomorrow at 11:59 PM. */
function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 0, 0);
  return d;
}

/** This week's Friday at 11:59 PM (next Friday if this one has passed). */
function thisFriday(): Date {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  d.setHours(23, 59, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 7);
  return d;
}

/** Sample assignments for demos; dates are relative to now so they never go stale. */
function demoAssignments(): DemoAssignment[] {
  return [
    { id: 'demo-ai', title: 'Homework 4: Constraint Satisfaction', course: 'CSCI-561', due: tomorrow() },
    { id: 'demo-gamedev', title: 'Game Prototype: Playable Build', course: 'CSCI-526', due: thisFriday() },
  ];
}

const fmt = (d: Date) =>
  d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function timeLeft(due: Date): { label: string; urgent: boolean } {
  const hours = Math.max(1, Math.round((due.getTime() - Date.now()) / 3_600_000));
  if (hours <= 48) return { label: `${hours} hours left`, urgent: true };
  const days = Math.round(hours / 24);
  return { label: `${days} days left`, urgent: false };
}

const PopupCard: React.FC<{ a: DemoAssignment; delay: number; autoFocus: boolean; onClosed: () => void }> = ({ a, delay, autoFocus, onClosed }) => {
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setLeaving(true);
    window.setTimeout(onClosed, 220);
  };
  const left = timeLeft(a.due);

  return (
    <div
      className={`tm-popup${left.urgent ? '' : ' is-soon'}${leaving ? ' is-leaving' : ''}`}
      style={{ animationDelay: leaving ? '0ms' : `${delay}ms` }}
      role="alertdialog"
      aria-labelledby={`${a.id}-title`}
      aria-describedby={`${a.id}-desc`}
    >
      <div className="tm-popup-icon" aria-hidden="true">
        <BellRing size={18} />
      </div>
      <div className="tm-popup-body">
        <p className="tm-popup-eyebrow">Assignment due soon</p>
        <h2 id={`${a.id}-title`} className="tm-popup-title">{a.title}</h2>
        <p id={`${a.id}-desc`} className="tm-popup-meta">
          {a.course} · Due {fmt(a.due)}
        </p>
        <p className="tm-popup-pill">
          <Clock size={12} aria-hidden="true" /> {left.label}
        </p>
      </div>
      <button type="button" className="tm-popup-close" onClick={close} aria-label={`Close notification: ${a.title}`} autoFocus={autoFocus}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
};

/**
 * Stacked "assignment due" pop-ups shown on every page load. Each closes on
 * its own; all reappear on the next refresh (nothing is stored).
 */
export const AssignmentPopup: React.FC = () => {
  const [items, setItems] = useState<DemoAssignment[]>([]);

  useEffect(() => {
    if (!SHOW_DEMO_ASSIGNMENT_POPUP) return;
    const t = window.setTimeout(() => setItems(demoAssignments()), 700);
    return () => window.clearTimeout(t);
  }, []);

  // Escape closes the newest (top) one.
  useEffect(() => {
    if (items.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setItems((prev) => prev.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <div className="tm-popup-stack">
      {items.map((a, i) => (
        <PopupCard
          key={a.id}
          a={a}
          delay={i * 180}
          autoFocus={i === 0}
          onClosed={() => setItems((prev) => prev.filter((x) => x.id !== a.id))}
        />
      ))}
    </div>
  );
};

export default AssignmentPopup;
