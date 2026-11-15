import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE } from './motion';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  x?: number;
  amount?: number;
}

/** Fades and lifts content in once, the first time it scrolls into view. Static under reduced motion. */
const Reveal: React.FC<RevealProps> = ({ children, className, delay = 0, y = 28, x = 0, amount = 0.2 }) => {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.85, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
};

export default Reveal;
