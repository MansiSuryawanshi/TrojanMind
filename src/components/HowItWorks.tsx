import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Reveal from './home/Reveal';
import { EASE } from './home/motion';
import './home/home.css';

const STEPS = [
  {
    title: 'Choose materials',
    description: 'Browse your Brightspace courses, or upload your own notes as text, a PDF, or a .txt file.',
  },
  {
    title: 'Practice and challenge',
    description: 'Take a timed challenge built from your material, solo against Claude or live with classmates.',
  },
  {
    title: 'Review feedback',
    description: 'Compare your answers with the ideal answers, then work through your weak areas in Exam Prep.',
  },
  {
    title: 'Plan your preparation',
    description: 'Follow an adaptive schedule toward your exam date and track progress in your Study Report.',
  },
];

/** The loop, as one staggered line. Static on purpose: it is reading content. */
const HowItWorks: React.FC = () => {
  const reduce = useReducedMotion();
  return (
  <section className="tmh tmh-dark" aria-labelledby="how-title">
    <div className="tmh-loop">
      <div className="tmh-loop-head">
        <Reveal>
          <p className="tmh-kicker tmh-kicker--on-ink">How it works</p>
          <h2 id="how-title" className="tmh-h2" style={{ marginTop: '1.2rem' }}>
            Four steps, <em>one study loop.</em>
          </h2>
        </Reveal>
      </div>
      <ol className="tmh-steps">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            className="tmh-step"
            initial={reduce ? false : { opacity: 0, y: 48 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: EASE, delay: i * 0.12 }}
          >
            <span className="tmh-step-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  </section>
  );
};

export default HowItWorks;
