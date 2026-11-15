import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import Reveal from './home/Reveal';
import { EASE } from './home/motion';
import './home/home.css';
import './home/showcase.css';
import './home/showcase-fx.css';

const STEPS = [
  { title: 'Choose materials', description: 'Browse your Brightspace courses, or upload your own notes as text, a PDF, or a .txt file.' },
  { title: 'Summarize', description: 'Turn materials into summaries, concepts and flashcards, and ask questions about them.' },
  { title: 'Practice and challenge', description: 'Take a timed challenge built from your material, solo against Claude or live with classmates.' },
  { title: 'Review feedback', description: 'Compare your answers with the ideal answers, then work through your weak areas in Exam Prep.' },
  { title: 'Plan your preparation', description: 'Follow an adaptive schedule toward your exam date and track progress in your Study Report.' },
];

/** A step whose marker lights up as the gold path reaches it. */
const Step: React.FC<{ index: number; progress: MotionValue<number>; reduce: boolean; title: string; description: string }> = ({ index, progress, reduce, title, description }) => {
  const at = (index + 0.2) / STEPS.length;
  const scale = useTransform(progress, [at - 0.06, at], [0, 1], { clamp: true });
  return (
    <motion.li
      className="tmy-step"
      initial={reduce ? false : { opacity: 0, y: 60, rotateX: 28 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.95, ease: EASE, delay: index * 0.08 }}
      style={{ transformPerspective: 900 }}
    >
      <span className="tmy-dot" aria-hidden="true">
        <motion.i style={{ scale: reduce ? 1 : scale }} />
      </span>
      <span className="tmy-n" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </motion.li>
  );
};

const WORDS = ['Five', 'steps.', 'One', 'study', 'loop.'];

/** The study loop as one path that fills with gold as you scroll. Reading content stays still. */
const HowItWorks: React.FC = () => {
  const reduce = !!useReducedMotion();
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
  const fill = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0, 1]);
  return (
    <section className="tmy" aria-labelledby="how-title">
      <div className="tmy-inner">
        <Reveal>
          <p className="tmy-kicker">How it works</p>
        </Reveal>
        <motion.h2
          id="how-title"
          className="tmy-h2"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={{ show: { transition: { staggerChildren: 0.08 } } }}
        >
          {WORDS.map((w, i) => (
            <React.Fragment key={i}>
              <span className="tmx-w">
                <motion.span
                  style={{ display: 'inline-block' }}
                  variants={{
                    hidden: reduce ? { y: 0 } : { y: '115%' },
                    show: { y: 0, transition: { duration: 0.9, ease: EASE } },
                  }}
                >
                  {i >= 2 ? <em>{w}</em> : w}
                </motion.span>
              </span>{' '}
            </React.Fragment>
          ))}
        </motion.h2>
        <div className="tmy-wrap">
          <div className="tmy-rail" aria-hidden="true">
            <motion.i className="tmy-fill tmy-fill--h" style={{ scaleX: fill }} />
            <motion.i className="tmy-fill tmy-fill--v" style={{ scaleY: fill }} />
          </div>
          <ol ref={ref} className="tmy-steps">
            {STEPS.map((s, i) => (
              <Step key={s.title} index={i} progress={fill} reduce={reduce} title={s.title} description={s.description} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
