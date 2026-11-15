import React from 'react';
import { motion, useTransform } from 'framer-motion';
import type { MotionValue } from 'framer-motion';

/**
 * Interface previews for the showcase. Everything here is illustrative and mirrors
 * things the app really does: Brightspace course modules, My Materials, side-by-side
 * answers with a reasoning score, concept feedback, a suggested follow-up, study
 * sessions and attempt history. Panels are position-agnostic so the same markup
 * works in the pinned stage and in the stacked layout.
 */

/** A highlight that sweeps in behind a row (driven by scroll when given a progress value). */
const Highlight: React.FC<{ p?: MotionValue<number>; tone?: 'gold' | 'red' }> = ({ p, tone = 'gold' }) =>
  p ? <motion.i className={`tmx-hl tmx-hl--${tone}`} style={{ scaleX: p }} /> : <i className={`tmx-hl tmx-hl--${tone}`} />;

export const Tile: React.FC<{ kind: string; name: string }> = ({ kind, name }) => (
  <div className="tmx-tile">
    <i>{kind}</i>
    {name}
  </div>
);

export const CoursePanel: React.FC<{ tiles?: boolean }> = ({ tiles }) => (
  <div className="tmx-card">
    <p className="tmx-tag">Course</p>
    <h4 className="tmx-title">Thermodynamics</h4>
    <p className="tmx-mod"><span>Module 1</span>Foundations</p>
    <div className="tmx-slots">
      {tiles ? (
        <>
          <Tile kind="PDF" name="Lecture notes" />
          <Tile kind="HTML" name="Reading page" />
        </>
      ) : (
        <>
          <span className="tmx-slot" />
          <span className="tmx-slot" />
        </>
      )}
    </div>
    <p className="tmx-mod"><span>Module 2</span>Entropy</p>
    <p className="tmx-mod"><span>Module 3</span>Heat engines</p>
  </div>
);

export const MaterialsPanel: React.FC<{ tiles?: boolean }> = ({ tiles }) => (
  <div className="tmx-card tmx-card--accent">
    <p className="tmx-tag">My Materials</p>
    <h4 className="tmx-title">Saved for study</h4>
    <div className="tmx-slots">
      {tiles ? (
        <>
          <Tile kind="PDF" name="Lecture notes" />
          <Tile kind="HTML" name="Reading page" />
        </>
      ) : (
        <>
          <span className="tmx-slot" />
          <span className="tmx-slot" />
        </>
      )}
    </div>
    <p className="tmx-fine">Used by Summary, Challenge and Exam Prep</p>
  </div>
);

export const QuestionChip: React.FC = () => (
  <div className="tmx-question">
    <span>Question</span>
    Why does entropy tend to increase in an isolated system?
  </div>
);

export const AnswerPanel: React.FC<{ kind: 'a' | 'b'; hl?: MotionValue<number>; flag?: MotionValue<number> }> = ({ kind, hl, flag }) => (
  <div className="tmx-card">
    <p className="tmx-tag">Answer {kind.toUpperCase()}</p>
    <div className="tmx-row">
      <small>Answer</small>
      Entropy increases.
    </div>
    <div className="tmx-row">
      <Highlight p={hl} tone={kind === 'a' ? 'gold' : 'red'} />
      <small>Reasoning</small>
      {kind === 'a'
        ? 'Far more disordered arrangements exist than ordered ones, so systems drift toward them.'
        : 'Systems want to become disordered.'}
    </div>
    <div className="tmx-depth">
      <small>Reasoning depth</small>
      <div className={`tmx-meter${kind === 'b' ? ' tmx-meter--red' : ''}`}>
        <i style={{ width: kind === 'a' ? '80%' : '40%' }} />
      </div>
    </div>
    {kind === 'b' &&
      (flag ? (
        <motion.span className="tmx-chip" style={{ opacity: flag }}>Reasoning gap</motion.span>
      ) : (
        <span className="tmx-chip">Reasoning gap</span>
      ))}
  </div>
);

const CONCEPTS = [
  { name: 'Entropy', v: 38, focus: true },
  { name: 'Heat engines', v: 74, focus: false },
  { name: 'First law', v: 81, focus: false },
];

export const FeedbackPanel: React.FC<{ hl?: MotionValue<number>; chip?: MotionValue<number> }> = ({ hl, chip }) => (
  <div className="tmx-card">
    <p className="tmx-tag">Answer feedback</p>
    <h4 className="tmx-title">Topic coverage</h4>
    {CONCEPTS.map((c) => (
      <div key={c.name} className="tmx-row tmx-row--concept">
        {c.focus && <Highlight p={hl} />}
        <span className="tmx-concept">
          {c.name}
          {c.focus &&
            (chip ? (
              <motion.b className="tmx-chip tmx-chip--inline" style={{ opacity: chip }}>Needs another look</motion.b>
            ) : (
              <b className="tmx-chip tmx-chip--inline">Needs another look</b>
            ))}
        </span>
        <div className="tmx-meter">
          <i style={{ width: `${c.v}%` }} />
        </div>
      </div>
    ))}
  </div>
);

export const PracticePanel: React.FC = () => (
  <div className="tmx-card tmx-card--accent">
    <p className="tmx-tag">Suggested practice</p>
    <p className="tmx-action">Defend your answer to a follow-up question</p>
    <p className="tmx-fine">Then get a verdict on your reasoning</p>
  </div>
);

export const SessionBlock: React.FC<{ when: string; what: string; priority?: boolean }> = ({ when, what, priority }) => (
  <div className={`tmx-session${priority ? ' tmx-session--priority' : ''}`}>
    <small>{when}</small>
    {what}
  </div>
);

const ATTEMPTS = [
  { n: 3, v: 72 },
  { n: 2, v: 64 },
  { n: 1, v: 55 },
];

export const HistoryPanel: React.FC = () => (
  <div className="tmx-card">
    <p className="tmx-tag">Attempt history</p>
    {ATTEMPTS.map((a) => (
      <div key={a.n} className="tmx-attempt">
        <span>Attempt {a.n}</span>
        <div className="tmx-meter">
          <i style={{ width: `${a.v}%` }} />
        </div>
        <b>{a.v}%</b>
      </div>
    ))}
  </div>
);

/** Clip-path wipe: a line of text revealed left to right as scroll advances. */
const WipeMotion: React.FC<{ p: MotionValue<number>; children: React.ReactNode }> = ({ p, children }) => {
  const clipPath = useTransform(p, [0, 1], ['inset(0 100% 0 0)', 'inset(0 0% 0 0)']);
  return <motion.div style={{ clipPath }}>{children}</motion.div>;
};
const Wipe: React.FC<{ p?: MotionValue<number>; children: React.ReactNode }> = ({ p, children }) =>
  p ? <WipeMotion p={p}>{children}</WipeMotion> : <div>{children}</div>;

const MODES = ['Quick Summary', 'Detailed Summary', 'Exam Revision Summary', 'Explain Simply'];

const SelectorMotion: React.FC<{ p: MotionValue<number> }> = ({ p }) => {
  const y = useTransform(p, [0, 1], ['0em', '5.4em']);
  return <motion.i className="tmx-sel" style={{ y }} />;
};

/** The four summary styles the Summary page really offers. The selection slides as the preview plays. */
export const ModePanel: React.FC<{ sel?: MotionValue<number> }> = ({ sel }) => (
  <div className="tmx-card">
    <p className="tmx-tag">Summary style</p>
    <div className="tmx-modes">
      {sel ? <SelectorMotion p={sel} /> : <i className="tmx-sel" style={{ transform: 'translateY(5.4em)' }} />}
      {MODES.map((m) => (
        <span key={m} className="tmx-mode">{m}</span>
      ))}
    </div>
  </div>
);

export const SummaryPanel: React.FC<{ l1?: MotionValue<number>; l2?: MotionValue<number>; l3?: MotionValue<number> }> = ({ l1, l2, l3 }) => (
  <div className="tmx-card">
    <p className="tmx-tag">Summary</p>
    <div className="tmx-tabs">
      <b>Overview</b>
      <span>Concepts</span>
      <span>Flashcards</span>
      <span>Ask AI</span>
    </div>
    <Wipe p={l1}>
      <p className="tmx-lead">Entropy measures how many ways energy can be arranged.</p>
    </Wipe>
    <Wipe p={l2}>
      <p className="tmx-body">Isolated systems drift toward the arrangements that are most numerous.</p>
    </Wipe>
    <Wipe p={l3}>
      <ul className="tmx-bullets">
        <li>Entropy rises in an isolated system</li>
        <li>No heat engine is perfectly efficient</li>
      </ul>
      <span className="tmx-chip tmx-chip--soft">Source pages 3 to 5</span>
    </Wipe>
  </div>
);
