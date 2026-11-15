import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowDown, ArrowRight, Upload } from 'lucide-react';
import TrojanHelmet from '../TrojanHelmet';
import { HOME_TABS } from '../../homeTabs';
import SceneCopy from './SceneCopy';
import { staged } from './staged';
import {
  AnswerCard,
  DAYS,
  DOCS,
  DayCard,
  DocCard,
  FeedbackFace,
  ProgressFace,
  QuestionBar,
  READINESS,
  RING_LENGTH,
  SCENES,
  SummaryUI,
} from './panels';
import type { StoryProps } from './HomeStory';

gsap.registerPlugin(ScrollTrigger);

/** Timeline length in abstract units, and how much scroll each unit takes. */
const T = 11.6;
const VH_PER_UNIT = 62;
/** Where each feature scene is fully settled, and where the active step changes. */
const HOLD = [2.05, 4.45, 7.1, 9.5];
const STEP_AT = [3.3, 5.7, 8.4];
const NAV_HEIGHT = 64;

/**
 * Resting place of each document (percent of the stage), its depth and tilt, and
 * whether it arrives from deep behind the helmet or from in front of the camera.
 */
const DOC_POSE = [
  { left: 62, top: 46, z: 60, r: -4, ry: -14, near: false },
  { left: 44, top: 25, z: -220, r: 6, ry: 18, near: true, dx: -30, dy: -22 },
  { left: 80, top: 22, z: -120, r: 8, ry: -22, near: false },
  { left: 45, top: 75, z: -40, r: -8, ry: 20, near: true, dx: -26, dy: 30 },
  { left: 84, top: 66, z: 140, r: 5, ry: -18, near: true, dx: 28, dy: 32 },
  { left: 66, top: 86, z: -300, r: -3, ry: 8, near: false },
];
const DAY_LEFT = [43.2, 53.6, 64, 74.4, 84.8];

/**
 * Desktop landing story: one sticky stage and one GSAP timeline scrubbed by scroll.
 * Hero → course materials → summary → arena → study plan → call to action.
 * Scrolling back simply runs the same timeline in reverse.
 */
const CinematicStory: React.FC<StoryProps> = ({ onNavigate, onExploreFeatures }) => {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const stage = el.querySelector<HTMLElement>('.cs-stage')!;
    const track = el.querySelector<HTMLElement>('.cs-track')!;

    const ctx = gsap.context(() => {
      const $ = <E extends Element = HTMLElement>(s: string) => gsap.utils.toArray<E>(s, el);
      const W = () => stage.offsetWidth;
      const H = () => stage.offsetHeight;
      const vw = (n: number) => () => (W() * n) / 100;
      const vh = (n: number) => () => (H() * n) / 100;

      const docs = $('.cs-doc');
      const sum = $('.cs-sum')[0];
      const result = $('.cs-result')[0];
      const copies = $('.cs-copy');
      const steps = $<HTMLButtonElement>('.cs-nav button');

      // Centre every stage object on its left/top anchor; all later x/y values are offsets from there.
      gsap.set('.cs-o', { xPercent: -50, yPercent: -50 });

      /* ── Entrance: plays once on load, on inner wrappers the scroll timeline never touches ── */
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.cs-glow-in', { scale: 0.1, autoAlpha: 0, duration: 1.9, ease: 'power2.out' }, 0)
        .from('.cs-rays-in', { scale: 0.5, rotation: -50, autoAlpha: 0, duration: 2.4 }, 0.1)
        .from('.cs-ring-in', { scale: 0.5, autoAlpha: 0, duration: 1.7 }, 0.25)
        .from('.cs-helm-in', { y: () => H() * 0.3, scale: 0.76, autoAlpha: 0, duration: 1.6, stagger: 0.08 }, 0.3)
        .from('.cs-h1 .st-line', { yPercent: 115, duration: 1.15, stagger: 0.17, ease: 'power4.out' }, 0.95)
        .from('.cs-hero-in', { y: 24, autoAlpha: 0, duration: 0.75, stagger: 0.12 }, 1.6)
        .from('.cs-hint-in', { autoAlpha: 0, y: -8, duration: 0.6 }, 2.4);

      /* ── Hidden until their scene ── */
      gsap.set([sum, '.cs-question', '.cs-vs', result, '.cs-face--progress', '.cs-final', '.cs-nav', '.cs-label', '.cs-disc'], { autoAlpha: 0 });
      gsap.set('.cs-bg-l', { opacity: 0 });
      gsap.set('.cs-vs', { scale: 0 });
      gsap.set('.cs-disc', { scale: 0.3 });

      const setStep = (t: number) => {
        const n = STEP_AT.filter((s) => t >= s).length;
        steps.forEach((b, i) => {
          if (i === n) b.setAttribute('aria-current', 'step');
          else b.removeAttribute('aria-current');
        });
      };
      setStep(0);

      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: {
          trigger: track,
          start: `top top+=${NAV_HEIGHT}`,
          end: 'bottom bottom',
          scrub: 0.7,
          invalidateOnRefresh: true,
          onUpdate: (self) => setStep(self.progress * T),
        },
      });

      const copyIn = (i: number, at: number) => {
        const c = copies[i];
        tl.fromTo(c, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: 'none' }, at);
        staged(tl, c.querySelectorAll('.js-line'), { yPercent: 115 }, { yPercent: 0, duration: 0.55, stagger: 0.09, ease: 'power3.out' }, at);
        staged(tl, c.querySelectorAll('.js-rest'), { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.07, ease: 'power2.out' }, at + 0.12);
      };
      const copyOut = (i: number, at: number) => {
        tl.to(copies[i], { autoAlpha: 0, y: vh(-6), duration: 0.4, ease: 'power2.in' }, at);
      };

      /* ═════ A · Hero → course materials (0 → 1.8) ═════ */
      tl.to('.cs-hint', { autoAlpha: 0, duration: 0.2 }, 0)
        .to('.cs-hero-copy', { autoAlpha: 0, y: vh(-9), duration: 0.6, ease: 'power1.in' }, 0)
        .to('.cs-h1-row', { y: (i: number) => -H() * (i ? 0.48 : 0.62), autoAlpha: 0, duration: 0.95, stagger: 0.07, ease: 'power2.in' }, 0.05)
        .to('.cs-helm--body', { x: vw(17), y: vh(-3), scale: 1.5, rotation: -5, duration: 1.7 }, 0)
        .to('.cs-helm--plume', { x: vw(16.4), y: vh(-4.2), scale: 1.45, rotation: -4.2, duration: 1.7 }, 0)
        .to('.cs-glow', { x: vw(11), scale: 1.5, duration: 1.7 }, 0)
        .to('.cs-rays', { x: vw(12), rotation: 55, scale: 1.35, duration: 1.7 }, 0)
        .to('.cs-ring', { x: vw(13), rotation: 130, scale: 1.55, duration: 1.7 }, 0)
        .to('.cs-bg-ink', { opacity: 0.3, duration: 1.2 }, 0.4);

      docs.forEach((d, i) => {
        const p = DOC_POSE[i];
        const from = p.near
          ? { x: vw(p.dx ?? 0), y: vh(p.dy ?? 0), z: 1000, rotation: p.r * 3, rotationY: p.ry * 2.2 }
          : { x: vw(86 - p.left), y: vh(55 - p.top), z: -1900, rotation: -p.r * 2, rotationY: -p.ry };
        tl.fromTo(
          d,
          { ...from, autoAlpha: 0 },
          { x: 0, y: 0, z: p.z, rotation: p.r, rotationY: p.ry, autoAlpha: 1, duration: 1.05, ease: 'power3.out' },
          0.45 + i * 0.11,
        );
      });
      tl.to(['.cs-nav', '.cs-label'], { autoAlpha: 1, duration: 0.4 }, 1.25);
      copyIn(0, 1.05);

      /* ═════ B · Materials → summary (2.3 → 4.3) ═════ */
      copyOut(0, 2.3);
      const lead = docs[0];
      docs.slice(1).forEach((d, k) => {
        const p = DOC_POSE[k + 1];
        const away = k % 2 === 0;
        tl.to(
          d,
          {
            x: vw((p.left - 62) * (away ? 0.9 : 0.25)),
            y: vh((p.top - 50) * (away ? 0.9 : 0.2)),
            z: away ? 1100 : -1900,
            rotationY: p.ry * 2.4,
            autoAlpha: 0,
            duration: 0.9,
            ease: 'power2.in',
          },
          2.3 + k * 0.07,
        );
      });
      // The lead document travels to the centre and stretches to the summary's footprint
      // while the summary starts squeezed to the document's footprint; the two cross-fade.
      tl.to(
        lead,
        {
          x: vw(64 - DOC_POSE[0].left),
          y: vh(50 - DOC_POSE[0].top),
          z: 0,
          rotation: 0,
          rotationY: 0,
          scaleX: () => sum.offsetWidth / lead.offsetWidth,
          scaleY: () => sum.offsetHeight / lead.offsetHeight,
          duration: 1.15,
        },
        2.4,
      )
        .to(lead, { autoAlpha: 0, duration: 0.4, ease: 'none' }, 2.9)
        .fromTo(
          sum,
          {
            x: vw(DOC_POSE[0].left - 64),
            y: vh(DOC_POSE[0].top - 50),
            z: DOC_POSE[0].z,
            rotation: DOC_POSE[0].r,
            rotationY: DOC_POSE[0].ry,
            scaleX: () => lead.offsetWidth / sum.offsetWidth,
            scaleY: () => lead.offsetHeight / sum.offsetHeight,
          },
          { x: 0, y: 0, z: 0, rotation: 0, rotationY: 0, scaleX: 1, scaleY: 1, duration: 1.15 },
          2.4,
        )
        .to(sum, { autoAlpha: 1, duration: 0.4, ease: 'none' }, 2.85)
        .to('.cs-helm--body', { x: vw(40), scale: 2.1, autoAlpha: 0, duration: 1.1 }, 2.3)
        .to('.cs-helm--plume', { x: vw(38.5), scale: 2, autoAlpha: 0, duration: 1.1 }, 2.3)
        // Lighting: the gold key light swings from behind the helmet to the upper left.
        .to('.cs-glow', { x: vw(-52), y: vh(-38), scale: 1.25, opacity: 0.55, duration: 1.4 }, 2.3)
        .to('.cs-rays', { autoAlpha: 0, rotation: 110, duration: 1 }, 2.3)
        .to('.cs-ring', { x: vw(-6), rotation: 250, scale: 1.2, opacity: 0.4, duration: 1.4 }, 2.3)
        .to('.cs-bg-ink', { opacity: 1, duration: 1.2 }, 2.3);
      // The interface fills in progressively: text, highlighted passages, key concepts.
      staged(tl, $('.cs-sum .js-sum-row'), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' }, 3.25);
      staged(tl, $('.cs-sum .js-hl'), { backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%', duration: 0.4, stagger: 0.28, ease: 'none' }, 3.5);
      staged(tl, $('.cs-sum .js-concept'), { autoAlpha: 0, x: 34 }, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.13, ease: 'power2.out' }, 3.5);
      staged(tl, $('.cs-sum .js-sum-foot'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 4.1);
      copyIn(1, 3.3);

      /* ═════ C · Summary → quiz arena (4.7 → 6.9) ═════ */
      copyOut(1, 4.7);
      tl.to(sum, { x: vw(40), y: vh(-8), z: -600, rotationY: -62, scale: 0.72, autoAlpha: 0, duration: 1, ease: 'power2.in' }, 4.7)
        .to('.cs-bg-arena', { opacity: 1, duration: 1.1 }, 4.75)
        .to('.cs-glow', { opacity: 0, duration: 0.9 }, 4.75)
        .to('.cs-ring', { x: vw(14), rotation: 380, scale: 0.8, opacity: 0.55, duration: 1.4 }, 4.75)
        .to('.cs-question', { autoAlpha: 1, duration: 0.25, ease: 'none' }, 5.1)
        .fromTo('.cs-question', { y: vh(-28), rotationX: -55 }, { y: 0, rotationX: 0, duration: 0.6, ease: 'power3.out' }, 5.1)
        .fromTo('.cs-question .js-q-text', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'none' }, 5.35)
        .fromTo('.cs-ans--a', { x: vw(-78), z: -400, rotationY: 62, autoAlpha: 0 }, { x: 0, z: 0, rotationY: 9, autoAlpha: 1, duration: 0.95, ease: 'power3.out' }, 5.25)
        .fromTo('.cs-ans--b', { x: vw(62), z: -400, rotationY: -62, autoAlpha: 0 }, { x: 0, z: 0, rotationY: -9, autoAlpha: 1, duration: 0.95, ease: 'power3.out' }, 5.37)
        // Comparison: each answer's key claim is marked, then scored.
        .to('.cs-vs', { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2.2)' }, 6.0);
      staged(tl, $('.cs-ans .js-ahl'), { backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%', duration: 0.35, stagger: 0.12, ease: 'none' }, 6.05);
      staged(tl, $('.cs-ans .js-meter'), { scaleX: 0 }, { scaleX: 1, duration: 0.45, stagger: 0.08, ease: 'power2.out' }, 6.2);
      staged(tl, $('.cs-ans .js-flag'), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.3, stagger: 0.1, ease: 'back.out(2)' }, 6.4);
      // Reasoning feedback rises between them.
      tl.to(result, { autoAlpha: 1, duration: 0.25, ease: 'none' }, 6.45)
        .fromTo(result, { y: vh(30), rotationX: 45, scale: 0.9 }, { y: 0, rotationX: 0, scale: 1, duration: 0.6, ease: 'power3.out' }, 6.45);
      $('.cs-ans .js-depth').forEach((n, i) => {
        const o = { v: 0 };
        const to = Number(n.dataset.to);
        tl.fromTo(o, { v: 0 }, { v: to, duration: 0.45, ease: 'power2.out', onUpdate: () => { n.textContent = String(Math.round(o.v)); } }, 6.2 + i * 0.08);
      });
      copyIn(2, 5.75);

      /* ═════ D · Arena → study plan (7.3 → 9.3) ═════ */
      copyOut(2, 7.3);
      tl.to('.cs-question', { y: vh(-30), autoAlpha: 0, duration: 0.5, ease: 'power2.in' }, 7.3)
        .to('.cs-vs', { scale: 0, autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, 7.3)
        .to('.cs-ans--a', { x: vw(-72), z: -500, rotationY: 62, autoAlpha: 0, duration: 0.85, ease: 'power2.in' }, 7.35)
        .to('.cs-ans--b', { x: vw(60), z: -500, rotationY: -62, autoAlpha: 0, duration: 0.85, ease: 'power2.in' }, 7.4)
        .to('.cs-bg-plan', { opacity: 1, duration: 1.1 }, 7.4)
        .to('.cs-ring', { x: vw(-4), y: vh(34), rotation: 500, scale: 1.7, opacity: 0.35, duration: 1.5 }, 7.4)
        // The feedback panel travels up, widens and becomes the progress visualization.
        .to(result, { y: vh(-55), width: '46em', height: '15.5em', duration: 1 }, 7.5)
        .to('.cs-face--feedback', { autoAlpha: 0, duration: 0.3, ease: 'none' }, 7.55)
        .to('.cs-face--progress', { autoAlpha: 1, duration: 0.35, ease: 'none' }, 7.9)
        .fromTo($('.cs-result .js-ring'), { strokeDashoffset: RING_LENGTH }, { strokeDashoffset: RING_LENGTH * (1 - READINESS / 100), duration: 0.6, ease: 'power2.out' }, 8.0)
        // …then unfolds into the day-by-day schedule.
        .fromTo('.cs-rail', { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power2.out' }, 8.45);
      staged(tl, $('.cs-result .js-bar'), { scaleX: 0 }, { scaleX: 1, duration: 0.45, stagger: 0.1, ease: 'power2.out' }, 8.1);
      {
        const pct = $('.cs-result .js-pct')[0];
        const o = { v: 0 };
        tl.fromTo(o, { v: 0 }, { v: READINESS, duration: 0.6, ease: 'power2.out', onUpdate: () => { pct.textContent = `${Math.round(o.v)}%`; } }, 8.0);
      }
      $('.cs-day').forEach((d, i) => {
        tl.fromTo(
          d,
          { x: vw(64 - DAY_LEFT[i]), y: vh(-36), z: -300, scale: 0.35, rotationX: -70, autoAlpha: 0 },
          { x: 0, y: 0, z: 0, scale: 1, rotationX: 0, autoAlpha: 1, duration: 0.65, ease: 'power3.out' },
          8.45 + i * 0.09,
        );
      });
      copyIn(3, 8.4);

      /* ═════ E · Study plan → call to action (9.7 → 11.3) ═════ */
      copyOut(3, 9.7);
      tl.to(['.cs-nav', '.cs-label'], { autoAlpha: 0, duration: 0.3 }, 9.7)
        .to('.cs-day', { y: vh(70), rotationX: 55, autoAlpha: 0, duration: 0.6, stagger: 0.05, ease: 'power2.in' }, 9.7)
        .to('.cs-rail', { autoAlpha: 0, duration: 0.3 }, 9.7)
        .to(result, { y: vh(-130), scale: 0.8, autoAlpha: 0, duration: 0.7, ease: 'power2.in' }, 9.75)
        .to('.cs-bg-final', { opacity: 1, duration: 1 }, 9.8)
        .to('.cs-disc', { autoAlpha: 1, scale: 1, duration: 1.1, ease: 'power3.out' }, 9.95)
        .to('.cs-ring', { x: vw(2), y: 0, rotation: 620, scale: 1.12, opacity: 0.55, duration: 1.2 }, 9.9)
        .to('.cs-rays', { x: vw(2), rotation: 200, scale: 1.2, autoAlpha: 1, duration: 1.2 }, 9.9)
        .to('.cs-helm--body', { x: vw(2), y: vh(-1), scale: 1.08, rotation: 4, autoAlpha: 1, duration: 1.25, ease: 'power3.out' }, 9.95)
        .to('.cs-helm--plume', { x: vw(2), y: vh(-1), scale: 1.08, rotation: 4, autoAlpha: 1, duration: 1.25, ease: 'power3.out' }, 10.0)
        .to('.cs-final', { autoAlpha: 1, duration: 0.2, ease: 'none' }, 10.4);
      staged(tl, $('.cs-final .js-line'), { yPercent: 115 }, { yPercent: 0, duration: 0.55, stagger: 0.12, ease: 'power3.out' }, 10.45);
      staged(tl, $('.cs-final .js-rest'), { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.09, ease: 'power2.out' }, 10.75);
      tl.to({}, { duration: 0.01 }, T - 0.01);

      document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => {});
    }, el);

    /* Pointer depth: layers shift by different amounts. Mouse only. */
    let frame = 0;
    let nx = 0;
    let ny = 0;
    const apply = () => {
      frame = 0;
      stage.style.setProperty('--px', nx.toFixed(3));
      stage.style.setProperty('--py', ny.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = stage.getBoundingClientRect();
      nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    stage.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      stage.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
      ctx.revert();
    };
  }, []);

  const jumpTo = (i: number) => {
    const track = root.current?.querySelector<HTMLElement>('.cs-track');
    const stage = root.current?.querySelector<HTMLElement>('.cs-stage');
    if (!track || !stage) return;
    const top = track.getBoundingClientRect().top + window.scrollY - NAV_HEIGHT;
    const travel = track.offsetHeight - stage.offsetHeight;
    window.scrollTo({ top: top + (HOLD[i] / T) * travel, behavior: 'smooth' });
  };

  return (
    <div ref={root} className="tmh st cs">
      <div className="cs-track" style={{ '--travel': `${T * VH_PER_UNIT}vh` } as React.CSSProperties}>
        {/* "Explore Features" scrolls here: the point where the materials scene is settled. */}
        <span id="features" className="cs-anchor" style={{ '--p': HOLD[0] / T } as React.CSSProperties} />

        <div className="cs-stage">
          <div className="cs-bg" aria-hidden="true">
            <i className="cs-bg-l cs-bg-ink" />
            <i className="cs-bg-l cs-bg-arena" />
            <i className="cs-bg-l cs-bg-plan" />
            <i className="cs-bg-l cs-bg-final" />
          </div>

          <div className="cs-world">
            {/* Light behind the helmet */}
            <div className="cs-o cs-glow" aria-hidden="true"><div className="cs-glow-in" /></div>
            <div className="cs-o cs-rays" aria-hidden="true"><div className="cs-rays-in" /></div>
            <div className="cs-o cs-disc" aria-hidden="true" />
            <div className="cs-o cs-ring" aria-hidden="true">
              <svg className="cs-ring-in" viewBox="0 0 800 800">
                <circle cx="400" cy="400" r="392" fill="none" stroke="rgba(255,204,0,0.5)" strokeWidth="1.5" />
                <circle cx="400" cy="400" r="350" fill="none" stroke="rgba(255,204,0,0.28)" strokeWidth="1.5" strokeDasharray="2 16" />
                <path d="M400 8 A392 392 0 0 1 792 400" fill="none" stroke="#ffcc00" strokeWidth="4" strokeLinecap="round" />
                <path d="M400 792 A392 392 0 0 1 60 596" fill="none" stroke="#ffcc00" strokeOpacity="0.7" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>

            {/* The headline threads between the plume (behind) and the helmet (in front). */}
            <div className="cs-o cs-helm cs-helm--plume" aria-hidden="true">
              <div className="cs-helm-in">
                <div className="cs-par" style={{ '--d': -12 } as React.CSSProperties}>
                  <TrojanHelmet layer="plume" className="tmh-helm-svg" />
                </div>
              </div>
            </div>

            <h1 id="hero-title" className="cs-h1">
              <span className="cs-h1-row"><span className="st-mask"><span className="st-line">Learn together.</span></span></span>
              <span className="cs-h1-row cs-h1-row--gold"><span className="st-mask"><span className="st-line">Reason deeper.</span></span></span>
            </h1>

            <div className="cs-o cs-helm cs-helm--body" aria-hidden="true">
              <div className="cs-helm-in">
                <div className="cs-par" style={{ '--d': 12 } as React.CSSProperties}>
                  <TrojanHelmet layer="body" className="tmh-helm-svg" sweep />
                </div>
              </div>
            </div>

            <div className="cs-hero-copy">
              <p className="tmh-kicker tmh-kicker--on-ink cs-hero-in">TrojanMind</p>
              <p className="cs-lede cs-hero-in">
                Bring your course materials together, challenge your reasoning with peers, uncover learning gaps, and
                prepare with a personalized study plan.
              </p>
              <div className="cs-cta-row">
                <span className="cs-hero-in">
                  <button type="button" className="tmh-btn tmh-btn--gold" onClick={() => onNavigate(HOME_TABS.materials)}>
                    My Materials
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </span>
                <span className="cs-hero-in">
                  <button type="button" className="tmh-btn tmh-btn--line" onClick={onExploreFeatures}>
                    Explore Features
                    <ArrowDown size={18} aria-hidden="true" />
                  </button>
                </span>
              </div>
            </div>

            {/* Course documents at different depths */}
            {DOCS.map((doc, i) => (
              <div
                key={doc.name}
                className="cs-o cs-doc"
                aria-hidden="true"
                style={{ left: `${DOC_POSE[i].left}%`, top: `${DOC_POSE[i].top}%` }}
              >
                <div className="cs-par" style={{ '--d': 10 + DOC_POSE[i].z / 12 } as React.CSSProperties}>
                  <div className="cs-float" style={{ '--dur': `${6.5 + i * 0.9}s`, '--delay': `${-i * 1.7}s` } as React.CSSProperties}>
                    <DocCard doc={doc} />
                  </div>
                </div>
              </div>
            ))}

            <div className="cs-o cs-sum" aria-hidden="true"><SummaryUI /></div>

            <div className="cs-o cs-question" aria-hidden="true"><QuestionBar /></div>
            <div className="cs-o cs-ans cs-ans--a" aria-hidden="true"><AnswerCard who="a" /></div>
            <div className="cs-o cs-ans cs-ans--b" aria-hidden="true"><AnswerCard who="b" /></div>
            <div className="cs-o cs-vs" aria-hidden="true">VS</div>

            <div className="cs-o cs-rail" aria-hidden="true" />
            {DAYS.map((d, i) => (
              <div key={d.day} className="cs-o cs-day" aria-hidden="true" style={{ left: `${DAY_LEFT[i]}%` }}>
                <DayCard d={d} index={i} />
              </div>
            ))}

            <div className="cs-o cs-result sp-panel" aria-hidden="true">
              <div className="cs-face cs-face--feedback"><FeedbackFace /></div>
              <div className="cs-face cs-face--progress"><ProgressFace /></div>
            </div>
          </div>

          <div className="cs-vignette" aria-hidden="true" />

          {/* Scene copy */}
          <div className="cs-copies">
            {SCENES.map((s, i) => (
              <div key={s.id} className="cs-copy">
                <SceneCopy
                  scene={s}
                  index={i}
                  onNavigate={onNavigate}
                  headingProps={i === 0 ? { id: 'features-title', tabIndex: -1 } : undefined}
                />
              </div>
            ))}
          </div>

          {/* Final call to action */}
          <div className="cs-final">
            <p className="tmh-kicker tmh-kicker--on-ink js-rest">Ready when you are</p>
            <h2 id="cta-title" className="cs-final-title">
              <span className="st-mask"><span className="st-line js-line">Start with</span></span>
              <span className="st-mask"><em className="st-line js-line">your courses.</em></span>
            </h2>
            <p className="cs-final-copy js-rest">
              See what’s in each of your Brightspace courses, or upload your own notes and go straight to a challenge.
            </p>
            <div className="cs-final-actions js-rest">
              <button type="button" className="tmh-btn tmh-btn--gold" onClick={() => onNavigate(HOME_TABS.courses)}>
                Start with your courses
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button type="button" className="tmh-link" onClick={() => onNavigate(HOME_TABS.upload)}>
                <Upload size={16} aria-hidden="true" />
                Upload materials instead
              </button>
            </div>
          </div>

          <ol className="cs-nav" aria-label="Feature sequence">
            {SCENES.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => jumpTo(i)}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {s.short}
                </button>
              </li>
            ))}
          </ol>
          <span className="cs-label">Illustrative preview</span>
          <span className="cs-hint" aria-hidden="true"><span className="cs-hint-in">Scroll<i /></span></span>
        </div>
      </div>
    </div>
  );
};

export default CinematicStory;
