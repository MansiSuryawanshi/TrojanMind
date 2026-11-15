import React, { useEffect, useRef } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

/**
 * Four illustrative scenes. Every figure, name and sentence inside them is sample
 * content, and each scene says so. They only render markup: the settle-in
 * transitions are driven by the `is-active` class (see home.css).
 */

interface SceneProps {
  active: boolean;
}

const cls = (base: string, active: boolean) => `tmh-scene ${base}${active ? ' is-active' : ''}`;

/** Counts up when its scene is on screen and active; shows the final value under reduced motion. */
const CountUp: React.FC<{ to: number; active: boolean; prefix?: string; suffix?: string }> = ({ to, active, prefix = '', suffix = '' }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const reduce = useReducedMotion();
  const value = useMotionValue(reduce ? to : 0);
  const text = useTransform(value, (v) => `${prefix}${Math.round(v)}${suffix}`);
  useEffect(() => {
    if (reduce) {
      value.set(to);
      return;
    }
    if (!(active && inView)) {
      value.set(0);
      return;
    }
    const controls = animate(value, to, { duration: 1.3, delay: 0.55, ease: [0.2, 0.8, 0.2, 1] });
    return () => controls.stop();
  }, [active, inView, reduce, to, value]);
  return <motion.span ref={ref}>{text}</motion.span>;
};

const EXAMPLE_LABEL = 'Example only: sample content, not your data';

export const CoursesScene: React.FC<SceneProps> = ({ active }) => (
  <div className={cls('tmh-sc1', active)} role="img" aria-label="Example: a course with modules, and the imported files saved to a My Materials workspace.">
    <div className="tmh-sheet tmh-sc1-course" data-in="left" style={{ '--d': 0 } as React.CSSProperties}>
      <p className="tmh-tag">Example course</p>
      <h4>Thermodynamics</h4>
      <ul className="tmh-modules">
        <li className="is-open">
          <b>Module 1</b> Foundations
          <ul className="tmh-files">
            <li><i>PDF</i>Lecture notes<em>Imports</em></li>
            <li><i>HTML</i>Reading page<em>Imports</em></li>
            <li className="is-ref"><i>Link</i>Recorded lecture<em>Reference only</em></li>
          </ul>
        </li>
        <li><b>Module 2</b> Entropy</li>
        <li><b>Module 3</b> Heat engines</li>
      </ul>
    </div>
    <div className="tmh-sheet tmh-sheet--cardinal tmh-sc1-space" data-in="right" style={{ '--d': 2 } as React.CSSProperties}>
      <span className="tmh-flow" data-in="draw" style={{ '--d': 3 } as React.CSSProperties} aria-hidden="true" />
      <p className="tmh-tag">My Materials</p>
      <ul className="tmh-chips">
        <li data-in style={{ '--d': 3 } as React.CSSProperties}>Lecture notes</li>
        <li data-in style={{ '--d': 4 } as React.CSSProperties}>Reading page</li>
        <li data-in style={{ '--d': 5 } as React.CSSProperties}>Your own notes</li>
      </ul>
      <p className="tmh-sc1-note">Kept together for Summary, Challenge and Exam Prep.</p>
    </div>
    <p className="tmh-eg" data-in style={{ '--d': 6 } as React.CSSProperties}>{EXAMPLE_LABEL}</p>
  </div>
);

export const ArenaScene: React.FC<SceneProps> = ({ active }) => (
  <div className={cls('tmh-sc2', active)} role="img" aria-label="Example: two explanations of the same question side by side, one with deeper reasoning and one with a flagged misconception.">
    <p className="tmh-q" data-in style={{ '--d': 0 } as React.CSSProperties}>
      <span>Example question</span>
      Why does entropy tend to increase in an isolated system?
    </p>
    <div className="tmh-duo">
      <article className="tmh-sheet tmh-ex tmh-ex--a" data-in="left" style={{ '--d': 1 } as React.CSSProperties}>
        <header><b>Explanation A</b><span>Depth <CountUp to={8} active={active} /> / 10</span></header>
        <p>
          Far more <mark>disordered arrangements</mark> exist than ordered ones, so random motion <mark>almost always</mark> drifts toward them.
        </p>
        <div className="tmh-meter"><i style={{ '--v': 0.8, '--d': 3 } as React.CSSProperties} /></div>
      </article>
      <article className="tmh-sheet tmh-ex tmh-ex--b" data-in="right" style={{ '--d': 2 } as React.CSSProperties}>
        <header><b>Explanation B</b><span>Depth <CountUp to={4} active={active} /> / 10</span></header>
        <p>
          Systems <mark className="bad">want to</mark> become disordered, so entropy goes up.
        </p>
        <div className="tmh-meter"><i style={{ '--v': 0.4, '--d': 4 } as React.CSSProperties} /></div>
        <p className="tmh-flag">Flagged: teleological reasoning</p>
      </article>
    </div>
    <p className="tmh-cap" data-in style={{ '--d': 5 } as React.CSSProperties}>
      Both correct. <em>Only one shows why.</em>
    </p>
    <p className="tmh-eg" data-in style={{ '--d': 6 } as React.CSSProperties}>{EXAMPLE_LABEL}</p>
  </div>
);

export const ExamScene: React.FC<SceneProps> = ({ active }) => (
  <div className={cls('tmh-sc3', active)} role="img" aria-label="Example: feedback on a past answer leading to a targeted follow-up question, with a readiness score.">
    <div className="tmh-ring" data-in style={{ '--d': 0 } as React.CSSProperties}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="track" cx="20" cy="20" r="15.915" pathLength={100} />
        <circle className="val" cx="20" cy="20" r="15.915" pathLength={100} style={{ '--v': 64 } as React.CSSProperties} />
      </svg>
      <div>
        <b><CountUp to={64} active={active} suffix="%" /></b>
        <small>Readiness</small>
      </div>
    </div>
    <article className="tmh-sheet tmh-fb" data-in="left" style={{ '--d': 1 } as React.CSSProperties}>
      <p className="tmh-tag">Answer feedback</p>
      <dl>
        <dt>Your answer</dt>
        <dd>A positive test means the disease is likely.</dd>
        <dt>Ideal answer</dt>
        <dd>Likelihood depends on how common the disease is. Start from the base rate.</dd>
      </dl>
      <p className="tmh-gap">Gap: conditional probability</p>
    </article>
    <span className="tmh-arrow" data-in="draw" style={{ '--d': 3 } as React.CSSProperties} aria-hidden="true" />
    <article className="tmh-sheet tmh-sheet--cardinal tmh-practice" data-in="right" style={{ '--d': 3 } as React.CSSProperties}>
      <p className="tmh-tag">Targeted practice</p>
      <p className="tmh-follow">Suppose 1 in 10,000 people have it. Does your answer change?</p>
      <p className="tmh-verdict">Defend it, then get a verdict</p>
    </article>
    <p className="tmh-eg" data-in style={{ '--d': 6 } as React.CSSProperties}>{EXAMPLE_LABEL}</p>
  </div>
);

const CHART_POINTS: Array<[number, number]> = [
  [14, 92],
  [64, 80],
  [114, 86],
  [164, 58],
  [214, 50],
  [266, 26],
];
const LINE_D = CHART_POINTS.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
const AREA_D = `${LINE_D} L266 112 L14 112 Z`;

export const PlanScene: React.FC<SceneProps> = ({ active }) => (
  <div className={cls('tmh-sc4', active)} role="img" aria-label="Example: a short list of next study actions beside an accuracy trend over time.">
    <article className="tmh-sheet tmh-sc4-plan" data-in="left" style={{ '--d': 1 } as React.CSSProperties}>
      <p className="tmh-tag">Next actions</p>
      <ol className="tmh-plan">
        <li className="now">
          <b>Today</b>
          <span>Priority gap: entropy<small>25 min, then a short check</small></span>
        </li>
        <li>
          <b>Tomorrow</b>
          <span>Practice conditional probability</span>
        </li>
        <li>
          <b>Thursday</b>
          <span>Re-run a challenge</span>
        </li>
      </ol>
    </article>
    <article className="tmh-sheet tmh-sheet--dark tmh-sc4-report" data-in="right" style={{ '--d': 0 } as React.CSSProperties}>
      <p className="tmh-tag">Progress</p>
      <div className="tmh-stats">
        <div><b><CountUp to={12} active={active} /></b><small>Quizzes</small></div>
        <div><b><CountUp to={72} active={active} suffix="%" /></b><small>Avg accuracy</small></div>
        <div><b><CountUp to={9} active={active} prefix="+" /></b><small>Trend</small></div>
      </div>
      <svg className="tmh-chart" viewBox="0 0 280 118" aria-hidden="true">
        <line className="grid" x1="0" y1="30" x2="280" y2="30" />
        <line className="grid" x1="0" y1="70" x2="280" y2="70" />
        <line className="grid" x1="0" y1="112" x2="280" y2="112" />
        <path className="area" d={AREA_D} />
        <path className="line" d={LINE_D} pathLength={1} />
        {CHART_POINTS.map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="4.5" />
        ))}
      </svg>
    </article>
    <p className="tmh-eg" data-in style={{ '--d': 6 } as React.CSSProperties}>{EXAMPLE_LABEL}</p>
  </div>
);
