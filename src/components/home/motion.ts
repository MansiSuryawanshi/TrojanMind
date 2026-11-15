import { useReducedMotion } from 'framer-motion';

export const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Hover/tap feedback for buttons. Touch devices get the tap response; nothing depends on hover. */
export function usePress() {
  const reduce = useReducedMotion();
  return reduce ? {} : { whileHover: { y: -2 }, whileTap: { scale: 0.97, y: 0 }, transition: { type: 'spring' as const, stiffness: 500, damping: 30 } };
}
