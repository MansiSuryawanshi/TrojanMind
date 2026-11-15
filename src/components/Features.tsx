import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowRight, Upload } from 'lucide-react';
import { HOME_TABS } from './homeTabs';
import { ArenaScene, CoursesScene, ExamScene, PlanScene } from './home/FeatureScenes';
import { useMediaQuery } from './home/useMediaQuery';
import Reveal from './home/Reveal';
import { usePress } from './home/motion';
import './home/home.css';

interface Action {
  label: string;
  tab: number;
}

interface Feature {
  id: string;
  short: string;
  title: string;
  lead: string;
  points: string[];
  note?: string;
  primary: Action[];
  secondary?: Action;
  Scene: React.FC<{ active: boolean }>;
}

// Every statement here describes behavior that exists in the linked page.
const FEATURES: Feature[] = [
  {
    id: 'courses',
    short: 'Materials',
    title: 'Your courses, gathered into one workspace.',
    lead: 'Browse your Brightspace courses, open each module, and keep the materials you want to study together.',
    points: [
      'Courses grouped by semester',
      'Supported files and HTML pages import into My Materials',
      'Prefer your own notes? Paste text or upload a PDF or .txt file',
    ],
    note: 'Google Drive files, recordings and external links stay as references. Files over 10 MB need a manual download and upload.',
    primary: [{ label: 'Browse My Courses', tab: HOME_TABS.courses }],
    secondary: { label: 'Upload materials instead', tab: HOME_TABS.upload },
    Scene: CoursesScene,
  },
  {
    id: 'arena',
    short: 'Arena',
    title: 'Same answer. Different depth.',
    lead: 'Turn study material into a timed question set, then compare how you reason against Claude or classmates in a live room.',
    points: [
      'Solo against Claude, or a room shared by code or invite link',
      '5, 10, 20 or 50 questions, 60 seconds each',
      'Ranked podium, then review each answer against the ideal answer',
    ],
    primary: [{ label: 'Enter the Arena', tab: HOME_TABS.challenge }],
    Scene: ArenaScene,
  },
  {
    id: 'exam-prep',
    short: 'Exam prep',
    title: 'Feedback that turns into practice.',
    lead: 'See how ready you are from your past challenges, then pressure-test the topics you are weakest on.',
    points: [
      'Readiness score and topic coverage from your attempts',
      'Predicted weak areas drawn from your mistakes',
      'Defend a past answer against a follow-up and get a verdict',
      'Exam-date countdown',
    ],
    primary: [{ label: 'Open Exam Prep', tab: HOME_TABS.examPrep }],
    Scene: ExamScene,
  },
  {
    id: 'schedule',
    short: 'Plans & reports',
    title: 'Know what to do next, and see it working.',
    lead: 'A day-by-day plan built around your latest concept gaps and the time left before your exam, with every quiz kept in one report.',
    points: [
      'Sessions focused on your weakest topics, with a priority gap first',
      'Regenerate the plan when new results arrive or your exam date changes',
      'Total quizzes, average accuracy, trend, and accuracy over time',
    ],
    note: 'The study schedule unlocks after you complete your first challenge.',
    primary: [
      { label: 'View Study Schedule', tab: HOME_TABS.schedule },
      { label: 'Open Study Report', tab: HOME_TABS.report },
    ],
    Scene: PlanScene,
  },
];

interface FeaturesProps {
  onNavigate: (tab: number) => void;
}

const FeatureText: React.FC<{
  f: Feature;
  index: number;
  onNavigate: (tab: number) => void;
  className?: string;
}> = ({ f, index, onNavigate, className = '' }) => {
  const press = usePress();
  return (
  <div className={`tmh-feat-text ${className}`}>
    <span className="tmh-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    <h3 className="tmh-h3" id={`feature-${f.id}`}>{f.title}</h3>
    <p className="tmh-lead">{f.lead}</p>
    <ul className="tmh-points">
      {f.points.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
    {f.note && <p className="tmh-note">{f.note}</p>}
    <div className="tmh-actions">
      {f.primary.map((a, i) => (
        <motion.button key={a.label} type="button" onClick={() => onNavigate(a.tab)} className={`tmh-btn ${i === 0 ? 'tmh-btn--ink' : 'tmh-btn--ink-line'}`} {...press}>
          {a.label}
          <ArrowRight size={17} aria-hidden="true" />
        </motion.button>
      ))}
      {f.secondary && (
        <button type="button" onClick={() => onNavigate(f.secondary!.tab)} className="tmh-link">
          <Upload size={15} aria-hidden="true" />
          {f.secondary.label}
        </button>
      )}
    </div>
  </div>
  );
};

const Features: React.FC<FeaturesProps> = ({ onNavigate }) => {
  const wide = useMediaQuery('(min-width: 1024px) and (min-height: 600px)');
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  // The pinned sequence is a desktop-only enhancement; everyone else gets the stacked version.
  const sequence = wide && !reduce;

  const seqRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: seqRef, offset: ['start start', 'end end'] });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = Math.min(FEATURES.length - 1, Math.max(0, Math.floor(v * FEATURES.length)));
    setStep((prev) => (prev === next ? prev : next));
    // Continuous scroll progress for the stage: overall (--p) and within the current step (--sp).
    const stage = stageRef.current;
    if (stage) {
      const scaled = Math.min(0.9999, Math.max(0, v)) * FEATURES.length;
      stage.style.setProperty('--p', Math.min(1, Math.max(0, v)).toFixed(4));
      stage.style.setProperty('--sp', (scaled - Math.floor(scaled)).toFixed(4));
    }
  });

  // Pointer tilt and light on the stage: desktop mouse only, one write per frame.
  useEffect(() => {
    const el = stageRef.current;
    if (!sequence || !el) return;
    let frame = 0;
    let vars = { tx: 0, ty: 0, mx: 0.3, my: 0.1 };
    const apply = () => {
      frame = 0;
      el.style.setProperty('--tx', vars.tx.toFixed(3));
      el.style.setProperty('--ty', vars.ty.toFixed(3));
      el.style.setProperty('--mx', vars.mx.toFixed(3));
      el.style.setProperty('--my', vars.my.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      vars = { tx: x * 2 - 1, ty: y * 2 - 1, mx: x, my: y };
      el.classList.add('is-live');
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      vars = { tx: 0, ty: 0, mx: 0.3, my: 0.1 };
      el.classList.remove('is-live');
      if (!frame) frame = requestAnimationFrame(apply);
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sequence]);

  const jumpTo = useCallback((i: number) => {
    const el = seqRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const travel = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + ((i + 0.5) / FEATURES.length) * travel, behavior: reduce ? 'auto' : 'smooth' });
  }, [reduce]);

  return (
    <section id="features" className="tmh tmh-features tm-anchor" aria-labelledby="features-title">
      <header className="tmh-feat-head">
        <Reveal>
          <p className="tmh-kicker">Features</p>
          <h2 id="features-title" tabIndex={-1} className="tmh-h2">
            From the course page to exam day, <em>in one place.</em>
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="tmh-feat-sub">Each scene shows a feature that is live in the app. Interface samples are labeled as examples.</p>
        </Reveal>
      </header>

      {sequence ? (
        <div ref={seqRef} className="tmh-seq">
          <div className="tmh-seq-sticky">
            <div className="tmh-seq-left">
              <div className="tmh-rail">
                <ol className="tmh-rail-labels" aria-label="Feature sequence">
                  {FEATURES.map((f, i) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className="tmh-rail-btn"
                        aria-current={i === step ? 'step' : undefined}
                        onClick={() => jumpTo(i)}
                      >
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        {f.short}
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="tmh-rail-track" aria-hidden="true">
                  <motion.div className="tmh-rail-fill" style={{ scaleX: scrollYProgress }} />
                </div>
              </div>
              <div className="tmh-seq-texts">
                {FEATURES.map((f, i) => (
                  <FeatureText key={f.id} f={f} index={i} onNavigate={onNavigate} className={i === step ? 'is-active' : ''} />
                ))}
              </div>
            </div>
            <div ref={stageRef} className="tmh-stage">
              <div className="tmh-hud" aria-hidden="true">
                <span>Scene <b>{String(step + 1).padStart(2, '0')}</b> / {String(FEATURES.length).padStart(2, '0')}</span>
                <span>{FEATURES[step].short}</span>
              </div>
              {['tl', 'tr', 'bl', 'br'].map((c) => (
                <span key={c} className={`tmh-corner tmh-corner--${c}`} aria-hidden="true" />
              ))}
              <span key={step} className="tmh-scan" aria-hidden="true" />
              <div className="tmh-tilt">
                {FEATURES.map((f, i) => (
                  <f.Scene key={f.id} active={i === step} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="tmh-stack">
          {FEATURES.map((f, i) => (
            <article key={f.id} className="tmh-feat" aria-labelledby={`feature-${f.id}`}>
              <Reveal x={i % 2 ? 24 : -24} y={20}>
                <FeatureText f={f} index={i} onNavigate={onNavigate} />
              </Reveal>
              <Reveal delay={0.12} y={36} x={i % 2 ? -24 : 24} amount={0.1}>
                <div className="tmh-stage">
                  <div className="tmh-tilt">
                    <f.Scene active />
                  </div>
                </div>
              </Reveal>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default Features;
