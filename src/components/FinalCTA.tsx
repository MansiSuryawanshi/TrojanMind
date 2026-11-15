import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Upload } from 'lucide-react';
import TrojanHelmet from './home/TrojanHelmet';
import { EASE, usePress } from './home/motion';
import './home/home.css';

interface FinalCTAProps {
  onCourses: () => void;
  onUpload: () => void;
}

const FinalCTA: React.FC<FinalCTAProps> = ({ onCourses, onUpload }) => {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const press = usePress();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] });
  const helmY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [140, -20]);
  // The scroll trigger lives on the headline itself. Observing the lines directly never fires,
  // because each starts pushed down inside a clipping mask and is never "mostly visible".
  const line = {
    hidden: reduce ? { y: 0, opacity: 1 } : { y: '70%', opacity: 0.2 },
    show: (i: number) => ({ y: 0, opacity: 1, transition: { duration: 0.9, ease: EASE, delay: 0.08 + i * 0.12 } }),
  };
  return (
  <section ref={ref} className="tmh tmh-final" aria-labelledby="cta-title">
    <div className="tmh-final-inner">
      <p className="tmh-kicker tmh-kicker--on-ink">Ready when you are</p>
      <motion.h2
        id="cta-title"
        className="tmh-final-title"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        <span className="tmh-reveal-mask"><motion.span style={{ display: 'block' }} variants={line} custom={0}>Start with</motion.span></span>
        <span className="tmh-reveal-mask"><motion.em style={{ display: 'block' }} variants={line} custom={1}>your courses.</motion.em></span>
      </motion.h2>
      <p className="tmh-final-copy">
        See what’s in each of your Brightspace courses, or upload your own notes and go straight to a challenge.
      </p>
      <div className="tmh-final-actions">
        <motion.button type="button" onClick={onCourses} className="tmh-btn tmh-btn--gold" {...press}>
          Go to My Courses
          <ArrowRight size={18} aria-hidden="true" />
        </motion.button>
        <button type="button" onClick={onUpload} className="tmh-link" style={{ color: 'var(--h-on-ink)' }}>
          <Upload size={16} aria-hidden="true" />
          Upload materials instead
        </button>
      </div>
      <div className="tmh-final-helm" aria-hidden="true">
        <motion.div style={{ y: helmY }} className="tmh-fill">
          <TrojanHelmet className="tmh-helm-svg" />
        </motion.div>
      </div>
    </div>
  </section>
  );
};

export default FinalCTA;
