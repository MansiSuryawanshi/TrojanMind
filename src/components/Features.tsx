import React, { useCallback, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { HOME_TABS } from './homeTabs';
import Reveal from './home/Reveal';
import { useMediaQuery } from './home/useMediaQuery';
import { usePress } from './home/motion';
import { SETTLED, SWAP, U_SPAN, VH_PER_UNIT, usePanel, useRamp } from './home/showcaseMotion';
import {
  AnswerPanel,
  CoursePanel,
  FeedbackPanel,
  HistoryPanel,
  MaterialsPanel,
  ModePanel,
  PracticePanel,
  QuestionChip,
  SessionBlock,
  SummaryPanel,
  Tile,
} from './home/ShowcasePanels';
import './home/home.css';
import './home/showcase.css';
import './home/showcase-fx.css';

interface FeaturesProps {
  onNavigate: (tab: number) => void;
}

interface Disclosure {
  summary: string;
  body: string;
  link?: { label: string; tab: number };
}

interface State {
  id: string;
  short: string;
  title: string;
  description: string;
  cta: { label: string; tab: number };
  disclosure?: Disclosure;
}

// Every statement describes behavior that exists in the linked page.
const STATES: State[] = [
  {
    id: 'materials',
    short: 'Materials',
    title: 'Your course. Ready to work with.',
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
    title: 'Read less. Understand more.',
    description: 'Pick a summary style, then explore concepts, flashcards and questions.',
    cta: { label: 'Open Summary', tab: HOME_TABS.summary },
  },
  {
    id: 'arena',
    short: 'Arena',
    title: 'Go beyond the right answer.',
    description: 'Challenge your reasoning and compare explanations.',
    cta: { label: 'Enter the Arena', tab: HOME_TABS.challenge },
  },
  {
    id: 'exam-prep',
    short: 'Exam prep',
    title: 'Know what needs another look.',
    description: 'Use practice feedback to choose your next topic.',
    cta: { label: 'Open Exam Prep', tab: HOME_TABS.examPrep },
  },
  {
    id: 'plan',
    short: 'Plan',
    title: 'Turn feedback into your next step.',
    description: 'Organize your preparation and revisit your results.',
    cta: { label: 'View Study Schedule', tab: HOME_TABS.schedule },
    disclosure: { summary: 'Availability', body: 'The study schedule unlocks after you complete your first challenge.' },
  },
];

/** Heading, description, one action and an optional disclosure. */
const CopyBody: React.FC<{ s: State; onNavigate: (tab: number) => void; heading: React.ReactNode }> = ({ s, onNavigate, heading }) => {
  const press = usePress();
  return (
    <>
      {heading}
      <p className="tmx-desc">{s.description}</p>
      <div className="tmx-actions">
        <motion.button type="button" className="tmh-btn tmh-btn--gold" onClick={() => onNavigate(s.cta.tab)} {...press}>
          {s.cta.label}
          <ArrowRight size={18} aria-hidden="true" />
        </motion.button>
      </div>
      {s.disclosure && (
        <details className="tmx-disc">
          <summary>{s.disclosure.summary}</summary>
          <p>{s.disclosure.body}</p>
          {s.disclosure.link && (
            <button type="button" className="tmx-textlink" onClick={() => onNavigate(s.disclosure!.link!.tab)}>
              {s.disclosure.link.label}
            </button>
          )}
        </details>
      )}
    </>
  );
};

/** One heading word, sliding up out of (and back into) its mask on the scroll timeline. */
const Word: React.FC<{ u: MotionValue<number>; a: number; b: number; i: number; first: boolean; last: boolean; children: React.ReactNode }> = ({ u, a, b, i, first, last, children }) => {
  const d = 0.03 * i;
  const y = useTransform(u, [a + d, a + d + 0.24, b + d, b + d + 0.24], [first ? '0%' : '115%', '0%', '0%', last ? '0%' : '-115%']);
  return <motion.span className="tmx-wi" style={{ y }}>{children}</motion.span>;
};

/** One block of copy; its heading words, text and button follow the scroll timeline, and it is inert while hidden. */
const ScrollCopy: React.FC<{
  u: MotionValue<number>;
  s: State;
  index: number;
  active: boolean;
  onNavigate: (tab: number) => void;
}> = ({ u, s, index, active, onNavigate }) => {
  const first = index === 0;
  const last = index === STATES.length - 1;
  const a = first ? -0.8 : SWAP[index - 1];
  const b = last ? U_SPAN + 0.3 : SWAP[index] - 0.1;
  const opacity = useTransform(u, [a + 0.1, a + 0.34, b + 0.05, b + 0.3], [first ? 1 : 0, 1, 1, last ? 1 : 0]);
  const y = useTransform(u, [a + 0.1, a + 0.34, b + 0.05, b + 0.3], [first ? 0 : 18, 0, 0, last ? 0 : -18]);
  const heading = (
    <h3 id={`feature-${s.id}`} className="tmx-h3">
      {s.title.split(' ').map((w, i) => (
        <React.Fragment key={i}>
          <span className="tmx-w">
            <Word u={u} a={a} b={b} i={i} first={first} last={last}>{w}</Word>
          </span>{' '}
        </React.Fragment>
      ))}
    </h3>
  );
  return (
    <motion.div className="tmx-copy" style={{ opacity, y }} inert={!active} aria-hidden={!active}>
      <CopyBody s={s} onNavigate={onNavigate} heading={heading} />
    </motion.div>
  );
};

/** A band of oversized type that slides sideways as the page scrolls. */
const Marquee: React.FC<{ still: boolean }> = ({ still }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const x = useTransform(scrollYProgress, [0, 1], still ? ['0%', '0%'] : ['4%', '-38%']);
  const items = ['Materials', 'Summary', 'Arena', 'Exam prep', 'Plan', 'Progress'];
  return (
    <div ref={ref} className="tmx-marquee" aria-hidden="true">
      <motion.div className="tmx-marquee-track" style={{ x }}>
        {[...items, ...items].map((w, i) => (
          <span key={i} className={i % 3 === 1 ? 'is-solid' : undefined}>{w}<em /></span>
        ))}
      </motion.div>
    </div>
  );
};

/** The pinned desktop stage. Every panel is a pure function of one scroll timeline, so reverse scrolling just works. */
const Sequence: React.FC<{ onNavigate: (tab: number) => void }> = ({ onNavigate }) => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress: enter } = useScroll({ target: ref, offset: ['start end', 'start start'] });
  const { scrollYProgress: main } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  // u: -0.8 while the stage approaches, 0 when it pins, U_SPAN at the end.
  const u = useTransform([enter, main], ([e, m]: number[]) => -0.8 + 0.8 * e + U_SPAN * m);

  const [step, setStep] = useState(0);
  useMotionValueEvent(u, 'change', (v) => {
    const next = SWAP.filter((s) => v >= s).length;
    setStep((prev) => (prev === next ? prev : next));
  });

  const jumpTo = useCallback(
    (k: number) => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const travel = el.offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + (SETTLED[k] / U_SPAN) * travel, behavior: reduce ? 'auto' : 'smooth' });
    },
    [reduce],
  );

  const ENTER = { x: 34, s: 0.94, o: 0, ry: -24 };
  const course = usePanel(u, [[-0.8, ENTER], [0, { x: 0, s: 1, o: 1, ry: -8 }], [0.62, {}], [1.0, { x: -14, y: -2, s: 0.9, o: 0 }]]);
  // The stack stays on screen as the "source" for the summary, then gives way to the answers.
  const mine = usePanel(u, [[-0.3, { x: 10, o: 0, s: 0.96, ry: -10 }], [0.1, { x: 0, o: 1, s: 1 }], [0.62, {}], [1.1, { x: -42, y: -34, s: 0.62, ry: -6 }], [2.1, {}], [2.4, { x: -46, y: -36, s: 0.5, o: 0 }]]);
  const tile1 = usePanel(u, [[-0.8, ENTER], [0, { x: 0, s: 1, o: 1, ry: -8 }], [0.18, {}], [0.48, { x: 43, y: 32.2, ry: -10 }], [0.62, {}], [1.1, { x: -0.19, y: -6.23, s: 0.62, ry: -6 }], [2.1, {}], [2.5, { x: -3.12, y: 3.54, s: 1, o: 0, ry: 7 }]]);
  const tile2 = usePanel(u, [[-0.8, ENTER], [0, { x: 0, s: 1, o: 1, ry: -8 }], [0.24, {}], [0.54, { x: 43, y: 32.2, ry: -10 }], [0.62, {}], [1.1, { x: -0.19, y: -9.63, s: 0.62, ry: -6 }], [2.1, {}], [2.5, { x: 45.9, y: 4.59, s: 1, o: 0, ry: -7 }]]);

  const mode = usePanel(u, [[1.0, { y: 10, o: 0, s: 0.94, ry: -10 }], [1.35, { y: 0, o: 1, s: 1, ry: -8 }], [2.1, {}], [2.4, { x: -10, o: 0, s: 0.92 }]]);
  const summary = usePanel(u, [[1.0, { x: 22, y: 0, s: 0.9, o: 0, ry: -75 }], [1.4, { x: 0, y: 0, s: 1, o: 1, ry: -6 }], [2.1, {}], [2.5, { x: 26, y: -4, s: 0.9, o: 0, ry: 62 }]]);
  const sel = useRamp(u, 1.3, 1.6);
  const l1 = useRamp(u, 1.4, 1.6);
  const l2 = useRamp(u, 1.5, 1.7);
  const l3 = useRamp(u, 1.6, 1.82);

  const ansA = usePanel(u, [[2.1, { x: 2.93, y: -9.8, s: 0.5, o: 0, ry: -10 }], [2.2, {}], [2.5, { x: 0, y: 0, s: 1, o: 1, ry: 7 }], [3.0, {}], [3.3, { x: 12, y: 8, s: 0.88, o: 0, ry: 14 }]]);
  const ansB = usePanel(u, [[2.1, { x: -46.1, y: -14.2, s: 0.5, o: 0, ry: 10 }], [2.2, {}], [2.5, { x: 0, y: 0, s: 1, o: 1, ry: -7 }], [3.0, {}], [3.3, { x: -12, y: -2, s: 0.88, o: 0, ry: -14 }]]);
  const question = usePanel(u, [[2.4, { y: -4, o: 0, s: 0.97 }], [2.6, { y: 0, o: 1, s: 1 }], [3.0, {}], [3.2, { y: -3, o: 0 }]]);
  const hlA = useRamp(u, 2.6, 2.85);
  const hlB = useRamp(u, 2.68, 2.93);
  const flag = useRamp(u, 2.85, 2.97);

  const feedback = usePanel(u, [[3.0, { x: 6, y: 10, s: 0.9, o: 0, ry: -6, rx: 25 }], [3.1, {}], [3.45, { x: 0, y: 0, s: 1, o: 1, rx: 0 }], [4.05, {}], [4.35, { x: -8, y: -4, s: 0.72, o: 0, rx: -20 }]]);
  const practice = usePanel(u, [[3.6, { y: 8, o: 0, s: 0.96, ry: -5 }], [3.9, { y: 0, o: 1, s: 1, ry: -8 }], [4.05, {}], [4.3, { x: -4, y: -8, s: 0.8, o: 0 }]]);
  const hlF = useRamp(u, 3.45, 3.7);
  const chip = useRamp(u, 3.6, 3.75);

  const s1 = usePanel(u, [[4.2, { x: -2, y: 16, s: 0.85, o: 0, ry: -6, rx: 30 }], [4.5, { x: 0, y: 0, s: 1, o: 1, rx: 0 }]]);
  const s2 = usePanel(u, [[4.26, { x: -2, y: 16, s: 0.85, o: 0, ry: -6, rx: 30 }], [4.57, { x: 0, y: 0, s: 1, o: 1, rx: 0 }]]);
  const s3 = usePanel(u, [[4.32, { x: -2, y: 16, s: 0.85, o: 0, ry: -6, rx: 30 }], [4.64, { x: 0, y: 0, s: 1, o: 1, rx: 0 }]]);
  const history = usePanel(u, [[4.3, { x: 30, y: 4, s: 0.94, o: 0, ry: -22 }], [4.75, { x: 0, y: 0, s: 1, o: 1, ry: -8 }]]);

  // Camera: the whole stage banks and pulls back a little on every scene change.
  const camAt = [-0.8, ...SWAP.flatMap((t) => [t - 0.4, t, t + 0.4])];
  const camRY = useTransform(u, camAt, [0, ...SWAP.flatMap((_, i) => [0, i % 2 ? 6 : -6, 0])]);
  const camS = useTransform(u, camAt, [1, ...SWAP.flatMap(() => [1, 0.95, 1])]);

  // Background rings and light streaks travel with the same timeline.
  const ringA = useTransform(u, [-0.8, U_SPAN], [0, 220]);
  const ringB = useTransform(u, [-0.8, U_SPAN], [0, -140]);
  const streak1 = useTransform(u, [-0.8, U_SPAN], ['8vw', '-30vw']);
  const streak2 = useTransform(u, [-0.8, U_SPAN], ['-12vw', '22vw']);
  const streak3 = useTransform(u, [-0.8, U_SPAN], ['20vw', '-16vw']);

  return (
    <div ref={ref} className="tmx-seq" style={{ height: `${(U_SPAN * VH_PER_UNIT + 1) * 100}vh` }}>
      <div className="tmx-sticky">
        <div className="tmx-fx" aria-hidden="true">
          <motion.svg className="tmx-ring" viewBox="0 0 800 800" style={{ rotate: ringA }}>
            <circle cx="400" cy="400" r="380" fill="none" stroke="rgba(255,204,0,0.22)" strokeWidth="1.5" strokeDasharray="2 14" />
            <circle cx="400" cy="400" r="300" fill="none" stroke="rgba(196,43,43,0.45)" strokeWidth="2" strokeDasharray="120 60 6 60" />
            <path d="M400 20 A380 380 0 0 1 780 400" fill="none" stroke="#ffcc00" strokeOpacity="0.7" strokeWidth="2.5" strokeLinecap="round" />
          </motion.svg>
          <motion.svg className="tmx-ring tmx-ring--b" viewBox="0 0 800 800" style={{ rotate: ringB }}>
            <circle cx="400" cy="400" r="220" fill="none" stroke="rgba(255,226,170,0.18)" strokeWidth="1.5" strokeDasharray="1 10" />
            <path d="M400 180 A220 220 0 0 0 180 400" fill="none" stroke="#c42b2b" strokeOpacity="0.8" strokeWidth="3" strokeLinecap="round" />
          </motion.svg>
          <motion.i className="tmx-streak tmx-streak--1" style={{ x: streak1 }} />
          <motion.i className="tmx-streak tmx-streak--2" style={{ x: streak2 }} />
          <motion.i className="tmx-streak tmx-streak--3" style={{ x: streak3 }} />
        </div>

        <div className="tmx-left">
          <div className="tmx-progress">
            <ol className="tmx-steps" aria-label="Feature sequence">
              {STATES.map((s, i) => (
                <li key={s.id}>
                  <button type="button" className="tmx-step" aria-current={i === step ? 'step' : undefined} onClick={() => jumpTo(i)}>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    {s.short}
                  </button>
                </li>
              ))}
            </ol>
            <div className="tmx-track" aria-hidden="true">
              <motion.i style={{ scaleX: main }} />
            </div>
          </div>
          <div className="tmx-copies">
            {STATES.map((s, i) => (
              <ScrollCopy key={s.id} u={u} s={s} index={i} active={i === step} onNavigate={onNavigate} />
            ))}
          </div>
        </div>

        <div className="tmx-stage" aria-hidden="true">
          <motion.div className="tmx-canvas" style={{ rotateY: camRY, scale: camS, transformPerspective: 1800 }}>
            <motion.div className="tmx-p" style={{ left: '3cqw', top: '8cqw', width: '50cqw', ...course }}>
              <CoursePanel />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '46cqw', top: '44cqw', width: '50cqw', ...mine }}>
              <MaterialsPanel />
            </motion.div>
            <motion.div className="tmx-p tmx-p--tile" style={{ left: '6.12cqw', top: '23.46cqw', width: '43.8cqw', ...tile1 }}>
              <Tile kind="PDF" name="Lecture notes" />
            </motion.div>
            <motion.div className="tmx-p tmx-p--tile" style={{ left: '6.12cqw', top: '32.41cqw', width: '43.8cqw', ...tile2 }}>
              <Tile kind="HTML" name="Reading page" />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '4cqw', top: '38cqw', width: '36cqw', ...mode }}>
              <ModePanel sel={sel} />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '42cqw', top: '12cqw', width: '54cqw', ...summary }}>
              <SummaryPanel l1={l1} l2={l2} l3={l3} />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '3cqw', top: '27cqw', width: '44cqw', ...ansA }}>
              <AnswerPanel kind="a" hl={hlA} />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '52cqw', top: '37cqw', width: '44cqw', ...ansB }}>
              <AnswerPanel kind="b" hl={hlB} flag={flag} />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '6cqw', top: '8cqw', width: '62cqw', ...question }}>
              <QuestionChip />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '9cqw', top: '17cqw', width: '52cqw', ...feedback }}>
              <FeedbackPanel hl={hlF} chip={chip} />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '38cqw', top: '54cqw', width: '56cqw', ...practice }}>
              <PracticePanel />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '5cqw', top: '16cqw', width: '42cqw', ...s1 }}>
              <SessionBlock when="Today" what="Priority gap: Entropy" priority />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '11cqw', top: '26cqw', width: '42cqw', ...s2 }}>
              <SessionBlock when="Next" what="Practice session" />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '17cqw', top: '36cqw', width: '42cqw', ...s3 }}>
              <SessionBlock when="Then" what="Re-run a challenge" />
            </motion.div>
            <motion.div className="tmx-p" style={{ left: '44cqw', top: '50cqw', width: '50cqw', ...history }}>
              <HistoryPanel />
            </motion.div>
          </motion.div>
          <span className="tmx-label">Illustrative preview</span>
        </div>
      </div>
    </div>
  );
};

/** Mobile, tablet and reduced motion: five clean sections, no pinning. */
const STATIC_PREVIEWS: React.ReactNode[] = [
  <>
    <CoursePanel />
    <MaterialsPanel tiles />
  </>,
  <>
    <ModePanel />
    <SummaryPanel />
  </>,
  <>
    <QuestionChip />
    <AnswerPanel kind="a" />
    <AnswerPanel kind="b" />
  </>,
  <>
    <FeedbackPanel />
    <PracticePanel />
  </>,
  <>
    <SessionBlock when="Today" what="Priority gap: Entropy" priority />
    <SessionBlock when="Next" what="Practice session" />
    <SessionBlock when="Then" what="Re-run a challenge" />
    <HistoryPanel />
  </>,
];

const Stacked: React.FC<{ onNavigate: (tab: number) => void }> = ({ onNavigate }) => (
  <div className="tmx-stack">
    <p className="tmx-stack-note">Illustrative preview. The examples below are not your data.</p>
    {STATES.map((s, i) => (
      <article key={s.id} className="tmx-section" aria-labelledby={`feature-${s.id}`}>
        <Reveal y={24}>
          <p className="tmx-stack-n">{String(i + 1).padStart(2, '0')} · {s.short}</p>
          <CopyBody s={s} onNavigate={onNavigate} heading={<h3 id={`feature-${s.id}`} className="tmx-h3">{s.title}</h3>} />
        </Reveal>
        <Reveal y={36} delay={0.1} amount={0.1}>
          <div className={`tmx-static tmx-static--${i + 1}`} aria-hidden="true">{STATIC_PREVIEWS[i]}</div>
        </Reveal>
      </article>
    ))}
  </div>
);

const Features: React.FC<FeaturesProps> = ({ onNavigate }) => {
  const wide = useMediaQuery('(min-width: 1024px) and (min-height: 600px)');
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const sequence = wide && !reduce;

  return (
    <section id="features" className="tmx tm-anchor" aria-labelledby="features-title">
      <header className="tmx-head">
        <Reveal>
          <p className="tmx-kicker">Features</p>
          <h2 id="features-title" tabIndex={-1} className="tmx-h2">
            From course page to exam day.
          </h2>
        </Reveal>
      </header>
      <Marquee still={reduce} />
      {sequence ? <Sequence onNavigate={onNavigate} /> : <Stacked onNavigate={onNavigate} />}
    </section>
  );
};

export default Features;
