import React from 'react';
import { HOME_TABS } from '../../homeTabs';

/**
 * Copy and illustrative interface previews shared by the pinned (desktop) and
 * stacked (mobile / reduced motion) versions of the landing story.
 *
 * Every preview renders in its finished state by default. The animated versions
 * rewind the `js-*` hooks with GSAP, so no-JS and reduced motion stay complete.
 */

export interface Scene {
  id: string;
  short: string;
  title: [string, string];
  description: string;
  cta: { label: string; tab: number };
  link?: { label: string; tab: number };
  disclosure?: { summary: string; body: string; link?: { label: string; tab: number } };
}

// Every statement describes behavior that exists in the linked page.
export const SCENES: Scene[] = [
  {
    id: 'materials',
    short: 'Materials',
    title: ['Your course.', 'Ready to work with.'],
    description: 'Choose supported course materials or upload your own notes.',
    cta: { label: 'Browse My Courses', tab: HOME_TABS.courses },
    disclosure: {
      summary: 'Supported materials',
      body: 'Supported Brightspace files and HTML pages import into My Materials for Summary, Challenge and Exam Prep. Google Drive files, recordings and external links stay as references. Files over 10 MB need a manual download and upload. You can also paste text or upload a PDF or .txt file.',
      link: { label: 'Upload notes instead', tab: HOME_TABS.upload },
    },
  },
  {
    id: 'summary',
    short: 'Summary',
    title: ['Read less.', 'Understand more.'],
    description: 'Pick a summary style, then explore concepts, flashcards and questions.',
    cta: { label: 'Open Summary', tab: HOME_TABS.summary },
  },
  {
    id: 'arena',
    short: 'Arena',
    title: ['Go beyond', 'the right answer.'],
    description: 'Challenge your reasoning and compare explanations.',
    cta: { label: 'Enter the Arena', tab: HOME_TABS.challenge },
    link: { label: 'Review weak areas in Exam Prep', tab: HOME_TABS.examPrep },
  },
  {
    id: 'plan',
    short: 'Plan',
    title: ['Turn feedback into', 'your next step.'],
    description: 'Organize your preparation and revisit your results.',
    cta: { label: 'View Study Schedule', tab: HOME_TABS.schedule },
    disclosure: { summary: 'Availability', body: 'The study schedule unlocks after you complete your first challenge.' },
  },
];

/* ── Course documents ─────────────────────────────────────────────────────── */

export interface Doc {
  kind: string;
  name: string;
  tone: 'cardinal' | 'gold' | 'ink';
}

export const DOCS: Doc[] = [
  { kind: 'PDF', name: 'Lecture 07 · Entropy', tone: 'cardinal' },
  { kind: 'PDF', name: 'Course syllabus', tone: 'ink' },
  { kind: 'HTML', name: 'Reading: the second law', tone: 'gold' },
  { kind: 'PDF', name: 'Problem set 3', tone: 'cardinal' },
  { kind: 'PPT', name: 'Week 6 slides', tone: 'gold' },
  { kind: 'TXT', name: 'My notes', tone: 'ink' },
];

const LINE_WIDTHS = [92, 78, 86, 64, 90, 72, 48];

export const DocCard: React.FC<{ doc: Doc }> = ({ doc }) => (
  <div className={`sp-doc sp-doc--${doc.tone}`}>
    <div className="sp-doc-top">
      <i>{doc.kind}</i>
    </div>
    <b>{doc.name}</b>
    <div className="sp-doc-lines">
      {LINE_WIDTHS.map((w, i) => (
        <u key={i} style={{ width: `${w}%` }} />
      ))}
    </div>
    <div className="sp-doc-fig">
      <s style={{ height: '42%' }} />
      <s style={{ height: '70%' }} />
      <s style={{ height: '55%' }} />
      <s style={{ height: '92%' }} />
    </div>
  </div>
);

/* ── Summary interface ────────────────────────────────────────────────────── */

const CONCEPTS: Array<[string, string]> = [
  ['Microstates', 'Ways to arrange the same energy'],
  ['Second law', 'Total entropy never falls'],
  ['Heat flow', 'Hot to cold, statistically'],
  ['Reversibility', 'The ideal, zero-gain limit'],
];

export const SummaryUI: React.FC = () => (
  <div className="sp-sum">
    <header className="sp-sum-bar">
      <i className="sp-badge">PDF</i>
      <b>Lecture 07 · Entropy</b>
      <span className="sp-tabs">
        <em>Summary</em>
        <span>Concepts</span>
        <span>Flashcards</span>
        <span>Questions</span>
      </span>
    </header>
    <div className="sp-sum-body">
      <div className="sp-sum-main">
        <p className="sp-eyebrow js-sum-row">Concise summary</p>
        <p className="sp-sum-title js-sum-row">Why disorder wins</p>
        <p className="sp-text js-sum-row">
          Entropy counts how many microscopic arrangements match what we observe.{' '}
          <mark className="js-hl">An isolated system drifts toward the states with the most arrangements</mark>, which is
          why heat flows from hot to cold and not back.
        </p>
        <p className="sp-text js-sum-row">
          <mark className="js-hl">The second law is statistical, not a goal</mark>: nothing “wants” disorder.{' '}
          <mark className="js-hl">Real processes always raise total entropy</mark>; reversible ones only hold it steady.
        </p>
      </div>
      <div className="sp-sum-side">
        <p className="sp-eyebrow js-sum-row">Key concepts</p>
        <ul>
          {CONCEPTS.map(([name, note]) => (
            <li key={name} className="js-concept">
              <b>{name}</b>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
    <footer className="sp-sum-foot js-sum-foot">
      <span>4 key concepts</span>
      <span>12 flashcards</span>
      <span>8 practice questions</span>
    </footer>
  </div>
);

/* ── Arena ────────────────────────────────────────────────────────────────── */

export const QuestionBar: React.FC = () => (
  <div className="sp-question">
    <span>Round 1 · Explain your reasoning</span>
    <b className="js-q-text">Why does heat flow from hot to cold, and never back?</b>
  </div>
);

export const AnswerCard: React.FC<{ who: 'a' | 'b' }> = ({ who }) => {
  const a = who === 'a';
  return (
    <div className={`sp-panel sp-answer sp-answer--${who}`}>
      <div className="sp-answer-head">
        <i>{a ? 'A' : 'B'}</i>
        <b>{a ? 'You' : 'Classmate'}</b>
        <span>Correct</span>
      </div>
      <p className="sp-answer-text">
        {a ? (
          <>
            Energy has <mark className="js-ahl">far more arrangements when it is spread out</mark>, so the system almost
            certainly ends up there.
          </>
        ) : (
          <>
            Because hot objects <mark className="js-ahl sp-mark--red">want to reach equilibrium</mark> with the cold ones
            around them.
          </>
        )}
      </p>
      <div className="sp-depth">
        <small>Reasoning depth</small>
        <strong className="js-depth" data-to={a ? 86 : 41}>{a ? 86 : 41}</strong>
        <span className={`sp-meter${a ? '' : ' sp-meter--red'}`}>
          <i className="js-meter" style={{ width: a ? '86%' : '41%' }} />
        </span>
      </div>
      <span className={`sp-chip js-flag${a ? ' sp-chip--gold' : ''}`}>{a ? 'Causal chain complete' : 'Teleological fallacy'}</span>
    </div>
  );
};

export const FeedbackFace: React.FC = () => (
  <div className="sp-feedback">
    <p className="sp-eyebrow">Reasoning feedback</p>
    <p className="sp-feedback-title">Same answer. Different depth.</p>
    <p className="sp-feedback-body">A explains the mechanism. B names the outcome, not the cause.</p>
    <div className="sp-feedback-chips">
      <span className="sp-chip">Gap: Entropy</span>
      <span className="sp-chip sp-chip--soft">Next: microstates</span>
    </div>
  </div>
);

/* ── Study plan ───────────────────────────────────────────────────────────── */

const TOPICS: Array<[string, number, boolean]> = [
  ['Entropy', 38, true],
  ['Heat engines', 62, false],
  ['First law', 84, false],
];

export const RING_LENGTH = 326.7; // circumference of r = 52
export const READINESS = 64;

export const ProgressFace: React.FC = () => (
  <div className="sp-progress">
    <div className="sp-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" className="sp-ring-track" />
        <circle
          cx="60"
          cy="60"
          r="52"
          className="sp-ring-fill js-ring"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - READINESS / 100)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <strong className="js-pct">{READINESS}%</strong>
    </div>
    <div className="sp-progress-main">
      <p className="sp-eyebrow">Study progress</p>
      <p className="sp-progress-title">Exam readiness</p>
      <div className="sp-topics">
        {TOPICS.map(([name, value, priority]) => (
          <div key={name} className="sp-topic">
            <span>{name}</span>
            <span className={`sp-meter${priority ? ' sp-meter--red' : ''}`}>
              <i className="js-bar" style={{ width: `${value}%` }} />
            </span>
            <b>{value}</b>
            {priority && <em>Priority</em>}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export interface Day {
  day: string;
  focus: string;
  sessions: string[];
  today?: boolean;
}

export const DAYS: Day[] = [
  { day: 'Mon', focus: 'Entropy', sessions: ['Microstates review', 'Flashcards · 12'], today: true },
  { day: 'Tue', focus: 'Practice', sessions: ['Problem set 3', 'Weak-area quiz'] },
  { day: 'Wed', focus: 'Arena', sessions: ['Rematch challenge'] },
  { day: 'Thu', focus: 'Heat engines', sessions: ['Summary reread', 'Flashcards · 8'] },
  { day: 'Fri', focus: 'Mock exam', sessions: ['Timed questions'] },
];

export const DayCard: React.FC<{ d: Day; index: number }> = ({ d, index }) => (
  <div className={`sp-day${d.today ? ' sp-day--today' : ''}`}>
    <small>Day {index + 1}</small>
    <b>{d.day}</b>
    <p>{d.focus}</p>
    {d.sessions.map((s) => (
      <span key={s}>{s}</span>
    ))}
  </div>
);
