import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowDown, ArrowRight } from 'lucide-react';
import TrojanHelmet from './home/TrojanHelmet';
import { usePress } from './home/motion';
import './home/home.css';

interface HeroProps {
  /** Opens My Materials (the app is only shown to signed-in users). */
  onOpenMaterials: () => void;
  onExploreFeatures: () => void;
}

const HEADLINE = [['Learn', 'together.'], ['Reason', 'deeper.']];
const INDEX = ['Course materials', 'Reasoning Arena', 'Exam preparation', 'Plans & reports'];

/**
 * One composed scene: the headline threads between the plume (behind) and the
 * helmet (in front). Entrance is pure CSS; pointer depth only runs for a fine
 * pointer when the visitor has not asked for reduced motion.
 */
const Hero: React.FC<HeroProps> = ({ onOpenMaterials, onExploreFeatures }) => {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const press = usePress();

  // Scroll-linked depth as the hero leaves: each layer drifts at its own rate.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const range = reduce ? [0, 0] : undefined;
  const plumeY = useTransform(scrollYProgress, [0, 1], range ?? [0, -70]);
  const bodyY = useTransform(scrollYProgress, [0, 1], range ?? [0, 40]);
  const discY = useTransform(scrollYProgress, [0, 1], range ?? [0, -110]);
  const copyY = useTransform(scrollYProgress, [0, 1], range ?? [0, -30]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1024px)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || reduce.matches) return;

    let frame = 0;
    let nx = 0;
    let ny = 0;
    const apply = () => {
      frame = 0;
      el.style.setProperty('--px', nx.toFixed(3));
      el.style.setProperty('--py', ny.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      nx = 0;
      ny = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={ref} className="tmh tmh-hero" aria-labelledby="hero-title">
      <div className="tmh-hero-inner">
        <div className="tmh-disc-wrap" aria-hidden="true">
          <motion.div style={{ y: discY }} className="tmh-fill">
            <div className="tmh-disc" />
          </motion.div>
        </div>

        <div className="tmh-helm-stack" aria-hidden="true">
          <div className="tmh-helm-pos tmh-z-plume">
            <motion.div style={{ y: plumeY }} className="tmh-fill">
              <div className="tmh-helm-enter tmh-helm-enter--plume">
                <TrojanHelmet layer="plume" className="tmh-helm-svg" />
              </div>
            </motion.div>
          </div>
          <div className="tmh-helm-pos tmh-z-body">
            <motion.div style={{ y: bodyY }} className="tmh-fill">
              <div className="tmh-helm-enter">
                <TrojanHelmet layer="body" className="tmh-helm-svg" sweep />
              </div>
            </motion.div>
          </div>
        </div>

        <h1 id="hero-title" className="tmh-h1">
          {HEADLINE.map((words, li) => (
            <span key={li} className={`tmh-line${li === 1 ? ' tmh-line--gold' : ''}`}>
              {words.map((w, wi) => (
                <React.Fragment key={w}>
                  <span className="tmh-word" style={{ '--w': li * 2 + wi } as React.CSSProperties}>{w}</span>
                  {wi < words.length - 1 ? ' ' : null}
                </React.Fragment>
              ))}
            </span>
          ))}
        </h1>

        <motion.div className="tmh-copy" style={{ y: copyY }}>
          <p className="tmh-kicker tmh-kicker--on-ink">TrojanMind</p>
          <p className="tmh-lede">
            Bring your course materials together, challenge your reasoning with peers, uncover learning gaps, and prepare
            with a personalized study plan.
          </p>
          <div className="tmh-cta-row">
            <motion.button type="button" onClick={onOpenMaterials} className="tmh-btn tmh-btn--gold" {...press}>
              My Materials
              <ArrowRight size={18} aria-hidden="true" />
            </motion.button>
            <motion.button type="button" onClick={onExploreFeatures} className="tmh-btn tmh-btn--line" {...press}>
              Explore Features
              <ArrowDown size={18} aria-hidden="true" />
            </motion.button>
          </div>
        </motion.div>

        <ol className="tmh-index" aria-label="What's inside">
          {INDEX.map((label, i) => (
            <li key={label}>
              <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default Hero;
