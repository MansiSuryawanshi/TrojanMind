import gsap from 'gsap';

/**
 * A staggered fromTo for a timeline that is driven by scroll.
 *
 * On a paused (scrubbed or scroll-triggered) timeline, GSAP only renders the start
 * state of the first target of a staggered tween up front; the rest stay in their
 * finished state until the playhead reaches them. Setting the start state on every
 * target first keeps the whole group hidden until its turn.
 *
 * Use ordinary CSS properties here, not custom properties: GSAP strips an inline
 * custom property again when it rewinds the targets it has not reached yet.
 */
export function staged(
  tl: gsap.core.Timeline,
  targets: gsap.TweenTarget,
  from: gsap.TweenVars,
  to: gsap.TweenVars,
  at?: gsap.Position,
): gsap.core.Timeline {
  gsap.set(targets, from);
  return tl.fromTo(targets, from, to, at);
}
