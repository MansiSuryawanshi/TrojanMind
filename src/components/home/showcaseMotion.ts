import { easeInOut, useTransform } from 'framer-motion';
import type { MotionValue } from 'framer-motion';

/**
 * One scroll timeline, `u`, drives every panel in the showcase. A panel is a list of
 * keyframes on that timeline; anything a keyframe leaves out carries over from the
 * one before it. Positions are in `cqw`, so the whole composition scales with the stage.
 */
export interface Pose {
  x?: number;
  y?: number;
  s?: number;
  o?: number;
  ry?: number;
  rx?: number;
}
export type Keys = Array<[number, Pose]>;

export function usePanel(u: MotionValue<number>, keys: Keys) {
  const base: Required<Pose> = { x: 0, y: 0, s: 1, o: 1, ry: 0, rx: 0 };
  const full = keys.reduce<Array<readonly [number, Required<Pose>]>>((acc, [t, pose]) => {
    const prev = acc.length ? acc[acc.length - 1][1] : base;
    return [...acc, [t, { ...prev, ...pose }] as const];
  }, []);
  const at = full.map((k) => k[0]);
  const opts = { ease: easeInOut };
  const x = useTransform(u, at, full.map((k) => `${k[1].x}cqw`), opts);
  const y = useTransform(u, at, full.map((k) => `${k[1].y}cqw`), opts);
  const scale = useTransform(u, at, full.map((k) => k[1].s), opts);
  const opacity = useTransform(u, at, full.map((k) => k[1].o), opts);
  const rotateY = useTransform(u, at, full.map((k) => k[1].ry), opts);
  const rotateX = useTransform(u, at, full.map((k) => k[1].rx), opts);
  // Each panel carries its own perspective, so DOM order (not 3D depth sorting) decides what is on top.
  return { x, y, scale, opacity, rotateY, rotateX, transformPerspective: 1400 };
}

/** A 0 to 1 ramp between two points on the timeline. */
export function useRamp(u: MotionValue<number>, from: number, to: number) {
  return useTransform(u, [from, to], [0, 1], { clamp: true });
}

/** Timeline length, where each of the five states is fully settled, and where copy swaps. */
export const U_SPAN = 5.2;
export const SETTLED = [0.1, 1.95, 2.85, 3.95, 4.9];
export const SWAP = [0.85, 2.05, 3.2, 4.2];
/** Viewport heights of scroll per unit of timeline. */
export const VH_PER_UNIT = 0.8;
