import React, { useCallback, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { HOME_TABS } from './homeTabs';
import Reveal from './home/Reveal';
import { useMediaQuery } from './home/useMediaQuery';
import { usePress } from './home/motion';
import { SETTLED, SWAP, U_SPAN, usePanel, useRamp } from './home/showcaseMotion';
import {
  AnswerPanel,
  CoursePanel,
  FeedbackPanel,
  HistoryPanel,
  MaterialsPanel,
  PracticePanel,
  QuestionChip,
  SessionBlock,
  Tile,
} from './home/ShowcasePanels';
import './home/home.css';
import './home/showcase.css';

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
    short: 'Plan & progress',
    title: 'Turn feedback into your next step.',
    description: 'Organize your preparation and revisit your results.',
    cta: { label: 'View Study Schedule', tab: HOME_TABS.schedule },
    disclosure: { summary: 'Availability', body: 'The study schedule unlocks after you complete your first challenge.' },
  },
];

/** Heading, description, one action and an optional disclosure. */
const CopyBody: React.FC<{ s: State; onNavigate: (tab: number) => void; headingId: string }> = ({ s, onNavigate, headingId }) => {
  const press = usePress();
  return (
    <>
      <h3 id={headingId} className="tmx-h3">{s.title}</h3>
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

/** One block of copy; fades and lifts with the scroll timeline, and is inert while hidden. */
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
  const b = last ? U_SPAN + 0.2 : SWAP[index] - 0.1;
  const opacity = useTransform(u, [a, a + 0.15, b, b + 0.15], [first ? 1 : 0, 1, 1, last ? 1 : 0]);
  const y = useTransform(u, [a, a + 0.15, b, b + 0.15], [first ? 0 : 16, 0, 0, last ? 0 : -16]);
  return (
    <motion.div className="tmx-copy" style={{ opacity, y }} inert={!active} aria-hidden={!active}>
      <CopyBody s={s} onNavigate={onNavigate} headingId={`feature-${s.id}`} />
    </motion.div>
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
    const next = v < SWAP[0] ? 0 : v < SWAP[1] ? 1 : v < SWAP[2] ? 2 : 3;
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
  const course = usePanel(u, [[-0.8, ENTER], [0, { x: 0, s: 1, o: 1, ry: -8 }], [0.62, {}], [0.95, { x: -14, y: -2, s: 0.9, o: 0 }]]);
  const mine = usePanel(u, [[-0.3, { x: 10, o: 0, s: 0.96, ry: -10 }], [0.1, { x: 0, o: 1, s: 1 }], [0.62, {}], [0.9, { x: 6, y: 4, s: 0.9, o: 0 }]]);
  const tile1 = usePanel(u, [[-0.8, ENTER], [0, { x: 0, s: 1, o: 1, ry: -8 }], [0.18, {}], [0.48, { x: 43, y: 32.2, ry: -10 }], [0.78, {}], [1.08, { x: -3.1, y: 3.5, o: 0, ry: 7 }]]);
  const tile2 = usePanel(u, [[-0.8, ENTER], [0, { x: 0, s: 1, o: 1, ry: -8 }], [0.24, {}], [0.54, { x: 43, y: 32.2, ry: -10 }], [0.78, {}], [1.08, { x: 45.9, y: 4.6, o: 0, ry: -7 }]]);
  const ansA = usePanel(u, [[0.78, { x: 46.1, y: 28.7, s: 0.97, o: 0, ry: -10 }], [1.1, { x: 0, y: 0, s: 1, o: 1, ry: 7 }], [1.55, {}], [1.85, { x: 12, y: 8, s: 0.88, o: 0, ry: 14 }]]);
  const ansB = usePanel(u, [[0.78, { x: -2.9, y: 27.6, s: 0.97, o: 0, ry: 10 }], [1.1, { x: 0, y: 0, s: 1, o: 1, ry: -7 }], [1.55, {}], [1.85, { x: -12, y: -2, s: 0.88, o: 0, ry: -14 }]]);
  const question = usePanel(u, [[1.05, { y: -4, o: 0, s: 0.97 }], [1.25, { y: 0, o: 1, s: 1 }], [1.55, {}], [1.75, { y: -3, o: 0 }]]);
  const feedback = usePanel(u, [[1.6, { x: 6, y: 10, s: 0.9, o: 0, ry: -6 }], [1.68, {}], [2.02, { x: 0, y: 0, s: 1, o: 1 }], [2.7, {}], [2.95, { x: -8, y: -4, s: 0.72, o: 0 }]]);
  const practice = usePanel(u, [[2.25, { y: 8, o: 0, s: 0.96, ry: -5 }], [2.55, { y: 0, o: 1, s: 1, ry: -8 }], [2.7, {}], [2.92, { x: -4, y: -8, s: 0.8, o: 0 }]]);
  const s1 = usePanel(u, [[2.78, { x: -2, y: 16, s: 0.85, o: 0, ry: -6 }], [3.05, { x: 0, y: 0, s: 1, o: 1 }]]);
  const s2 = usePanel(u, [[2.84, { x: -2, y: 16, s: 0.85, o: 0, ry: -6 }], [3.12, { x: 0, y: 0, s: 1, o: 1 }]]);
  const s3 = usePanel(u, [[2.9, { x: -2, y: 16, s: 0.85, o: 0, ry: -6 }], [3.2, { x: 0, y: 0, s: 1, o: 1 }]]);
  const history = usePanel(u, [[2.88, { x: 30, y: 4, s: 0.94, o: 0, ry: -22 }], [3.3, { x: 0, y: 0, s: 1, o: 1, ry: -8 }]]);

  const hlA = useRamp(u, 1.25, 1.45);
  const hlB = useRamp(u, 1.32, 1.52);
  const flag = useRamp(u, 1.45, 1.55);
  const hlF = useRamp(u, 2.05, 2.3);
  const chip = useRamp(u, 2.2, 2.35);

  return (
    <div ref={ref} className="tmx-seq" style={{ height: `${(U_SPAN + 1) * 100}vh` }}>
      <div className="tmx-sticky">
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
          <div className="tmx-canvas">
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
          </div>
          <span className="tmx-label">Illustrative preview</span>
        </div>
      </div>
    </div>
  );
};

/** Mobile, tablet and reduced motion: four clean sections, no pinning. */
const STATIC_PREVIEWS: React.ReactNode[] = [
  <>
    <CoursePanel />
    <MaterialsPanel tiles />
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
          <CopyBody s={s} onNavigate={onNavigate} headingId={`feature-${s.id}`} />
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
      {sequence ? <Sequence onNavigate={onNavigate} /> : <Stacked onNavigate={onNavigate} />}
    </section>
  );
};

export default Features;
