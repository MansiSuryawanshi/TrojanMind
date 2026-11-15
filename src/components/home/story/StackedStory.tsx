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

interface StackedProps extends StoryProps {
  /**
   * pinned: hero entrance, a short pinned hero-to-materials move, scroll-scrubbed scenes.
   * flow:   the same without pinning (very short viewports).
   * static: no animation at all (reduced motion); everything renders finished.
   */
  mode: 'pinned' | 'flow' | 'static';
}

const NAV_HEIGHT = 64;
/** Where the three hero documents settle on small screens (percent of the hero). */
const HERO_DOCS = [
  { doc: DOCS[0], left: 30, top: 34, r: -7, z: 40 },
  { doc: DOCS[2], left: 68, top: 22, r: 8, z: -160 },
  { doc: DOCS[3], left: 36, top: 70, r: 5, z: -80 },
];

const VISUALS: React.ReactNode[] = [
  <div className="ms-fan">
    {DOCS.slice(0, 3).map((d) => (
      <div key={d.name} className="ms-fan-card"><div className="js-fan"><DocCard doc={d} /></div></div>
    ))}
  </div>,
  <div className="ms-sum js-sum"><SummaryUI /></div>,
  <div className="ms-arena">
    <div className="js-q"><QuestionBar /></div>
    <div className="ms-answers">
      <div className="js-a"><AnswerCard who="a" /></div>
      <div className="js-b"><AnswerCard who="b" /></div>
    </div>
    <div className="sp-panel ms-feedback js-fb"><FeedbackFace /></div>
  </div>,
  <div className="ms-plan">
    <div className="sp-panel ms-progress js-prog"><ProgressFace /></div>
    <div className="ms-days">
      {DAYS.map((d, i) => (
        <div key={d.day} className="js-day"><DayCard d={d} index={i} /></div>
      ))}
    </div>
  </div>,
];

/** Phones, tablets and reduced motion: a hero, four stacked scenes and the call to action. */
const StackedStory: React.FC<StackedProps> = ({ onNavigate, onExploreFeatures, mode }) => {
  const root = useRef<HTMLDivElement>(null);
  const pinned = mode === 'pinned';

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || mode === 'static') return;
    const ctx = gsap.context(() => {
      const $ = <E extends Element = HTMLElement>(s: string, scope: Element = el) => gsap.utils.toArray<E>(s, scope);
      const hero = $('.ms-hero')[0];
      const H = () => hero.offsetHeight;
      const W = () => hero.offsetWidth;

      // Take over the CSS centring so scroll offsets are relative to it.
      gsap.set(['.ms-helm', '.ms-glow'], { xPercent: -50, x: 0, y: 0 });
      gsap.set('.ms-hero-doc', { xPercent: -50, yPercent: -50, x: 0, y: 0 });

      /* Entrance */
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.ms-glow-in', { scale: 0.1, autoAlpha: 0, duration: 1.8, ease: 'power2.out' }, 0)
        .from('.ms-helm-in', { y: () => H() * 0.25, scale: 0.76, autoAlpha: 0, duration: 1.5 }, 0.25)
        .from('.ms-h1 .st-line', { yPercent: 115, duration: 1.05, stagger: 0.15, ease: 'power4.out' }, 0.8)
        .from('.ms-hero-in', { y: 22, autoAlpha: 0, duration: 0.7, stagger: 0.12 }, 1.4);

      /* Hero → materials */
      const heroTl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: pinned
          ? { trigger: '.ms-hero-track', start: `top top+=${NAV_HEIGHT}`, end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true }
          : { trigger: hero, start: `top top+=${NAV_HEIGHT}`, end: 'bottom top', scrub: 0.6, invalidateOnRefresh: true },
      });
      if (pinned) {
        heroTl
          .to('.ms-hero-copy', { autoAlpha: 0, y: () => -H() * 0.08, duration: 0.3, ease: 'power1.in' }, 0)
          .to('.ms-h1-row', { y: () => -H() * 0.45, autoAlpha: 0, duration: 0.5, stagger: 0.05, ease: 'power2.in' }, 0.03)
          .to('.ms-helm', { x: () => W() * 0.2, y: () => -H() * 0.2, scale: 1.6, rotation: -5, duration: 1 }, 0)
          .to('.ms-glow', { y: () => -H() * 0.2, scale: 1.35, duration: 1 }, 0);
        $('.ms-hero-doc').forEach((d, i) => {
          const p = HERO_DOCS[i];
          heroTl.fromTo(
            d,
            { x: () => W() * (i === 1 ? 0.1 : -0.5), y: () => H() * (i === 1 ? 0.3 : 0.2), z: i === 1 ? -1600 : 800, rotation: p.r * 3, autoAlpha: 0 },
            { x: 0, y: 0, z: p.z, rotation: p.r, autoAlpha: 1, duration: 0.6, ease: 'power3.out' },
            0.3 + i * 0.1,
          );
        });
        heroTl
          .fromTo('.ms-cap', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 0.62)
          .to({}, { duration: 0.01 }, 1.05);
      } else {
        heroTl
          .to('.ms-helm', { y: () => H() * 0.12, scale: 1.3, rotation: -4, duration: 1, ease: 'none' }, 0)
          .to('.ms-h1', { y: () => -H() * 0.1, duration: 1, ease: 'none' }, 0);
      }

      /* Scenes: copy plays once in view; previews are scrubbed as they rise through the viewport. */
      $('.ms-scene').forEach((scene) => {
        const copy = scene.querySelector('.ms-copy')!;
        const t = gsap.timeline({ scrollTrigger: { trigger: copy, start: 'top 82%', toggleActions: 'play none none reverse' } });
        staged(t, copy.querySelectorAll('.js-line'), { yPercent: 115 }, { yPercent: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out' }, 0);
        staged(t, copy.querySelectorAll('.js-rest'), { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.07, ease: 'power2.out' }, 0.1);
      });
      const scrubbed = (trigger: string) =>
        gsap.timeline({
          defaults: { ease: 'power2.out' },
          scrollTrigger: { trigger, start: 'top 92%', end: 'top 30%', scrub: 0.6, invalidateOnRefresh: true },
        });
      const vw = (n: number) => () => (window.innerWidth * n) / 100;
      const P = { transformPerspective: 900 };

      const fan = scrubbed('.ms-fan');
      staged(fan, '.js-fan', { xPercent: (i: number) => (1 - i) * 62, y: 90, scale: 0.8, autoAlpha: 0 }, { xPercent: 0, y: 0, scale: 1, autoAlpha: 1, duration: 1, stagger: 0.12 });

      const sum = scrubbed('.ms-sum').fromTo('.js-sum', { y: 90, rotationX: 24, scale: 0.86, autoAlpha: 0, ...P }, { y: 0, rotationX: 0, scale: 1, autoAlpha: 1, duration: 0.5 });
      staged(sum, $('.ms-sum .js-hl'), { backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%', duration: 0.25, stagger: 0.2, ease: 'none' }, 0.4);
      staged(sum, $('.ms-sum .js-concept'), { x: 30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.25, stagger: 0.1 }, 0.45);

      const arena = scrubbed('.ms-arena')
        .fromTo('.js-q', { y: -40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.25 })
        .fromTo('.js-a', { x: vw(-80), rotationY: 45, autoAlpha: 0, ...P }, { x: 0, rotationY: 0, autoAlpha: 1, duration: 0.45 }, 0.1)
        .fromTo('.js-b', { x: vw(80), rotationY: -45, autoAlpha: 0, ...P }, { x: 0, rotationY: 0, autoAlpha: 1, duration: 0.45 }, 0.2)
        .fromTo('.js-fb', { y: 60, scale: 0.92, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.3 }, 0.8);
      staged(arena, $('.ms-arena .js-ahl'), { backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%', duration: 0.25, stagger: 0.1, ease: 'none' }, 0.55);
      staged(arena, $('.ms-arena .js-meter'), { scaleX: 0 }, { scaleX: 1, duration: 0.3, stagger: 0.08 }, 0.6);

      const plan = scrubbed('.ms-plan')
        .fromTo('.js-prog', { y: 70, scale: 0.9, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.35 })
        .fromTo($('.ms-plan .js-ring'), { strokeDashoffset: RING_LENGTH }, { strokeDashoffset: RING_LENGTH * (1 - READINESS / 100), duration: 0.35 }, 0.25);
      staged(plan, $('.ms-plan .js-bar'), { scaleX: 0 }, { scaleX: 1, duration: 0.3, stagger: 0.07 }, 0.3);
      staged(plan, '.js-day', { y: 70, rotationX: -55, autoAlpha: 0, ...P }, { y: 0, rotationX: 0, autoAlpha: 1, duration: 0.35, stagger: 0.08 }, 0.5);

      /* Call to action */
      const fin = gsap
        .timeline({ defaults: { ease: 'power2.out' }, scrollTrigger: { trigger: '.ms-final', start: 'top 90%', end: 'top 20%', scrub: 0.6 } })
        .fromTo('.ms-final-disc', { scale: 0.3, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1 }, 0)
        .fromTo('.ms-final-helm', { yPercent: 40, scale: 0.75, rotation: 12, autoAlpha: 0 }, { yPercent: 0, scale: 1, rotation: 0, autoAlpha: 1, duration: 1 }, 0);
      staged(fin, $('.ms-final .js-line'), { yPercent: 115 }, { yPercent: 0, duration: 0.5, stagger: 0.12 }, 0.3);
      staged(fin, $('.ms-final .js-rest'), { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.08 }, 0.5);

      document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => {});
    }, el);
    return () => ctx.revert();
  }, [mode, pinned]);

  return (
    <div ref={root} className={`tmh st ms ms--${mode}`}>
      <div className="ms-hero-track">
        <section className="ms-hero" aria-labelledby="hero-title">
          <div className="ms-glow" aria-hidden="true"><div className="ms-glow-in" /></div>
          <div className="ms-helm" aria-hidden="true">
            <div className="ms-helm-in"><TrojanHelmet className="tmh-helm-svg" sweep={mode !== 'static'} /></div>
          </div>
          <h1 id="hero-title" className="ms-h1">
            <span className="ms-h1-row"><span className="st-mask"><span className="st-line">Learn together.</span></span></span>
            <span className="ms-h1-row ms-h1-row--gold"><span className="st-mask"><span className="st-line">Reason deeper.</span></span></span>
          </h1>
          <div className="ms-hero-copy">
            <p className="tmh-kicker tmh-kicker--on-ink ms-hero-in">TrojanMind</p>
            <p className="ms-lede ms-hero-in">
              Bring your course materials together, challenge your reasoning with peers, uncover learning gaps, and
              prepare with a personalized study plan.
            </p>
            <div className="ms-cta-row">
              <span className="ms-hero-in">
                <button type="button" className="tmh-btn tmh-btn--gold" onClick={() => onNavigate(HOME_TABS.materials)}>
                  My Materials
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </span>
              <span className="ms-hero-in">
                <button type="button" className="tmh-btn tmh-btn--line" onClick={onExploreFeatures}>
                  Explore Features
                  <ArrowDown size={18} aria-hidden="true" />
                </button>
              </span>
            </div>
          </div>
          {pinned && (
            <>
              {HERO_DOCS.map((p) => (
                <div key={p.doc.name} className="ms-hero-doc" aria-hidden="true" style={{ left: `${p.left}%`, top: `${p.top}%` }}>
                  <DocCard doc={p.doc} />
                </div>
              ))}
              <p className="ms-cap" aria-hidden="true">Your course materials, pulled into one place.</p>
            </>
          )}
        </section>
      </div>

      <div id="features" className="ms-scenes">
        <p className="ms-note">Illustrative preview. The examples below are not your data.</p>
        {SCENES.map((s, i) => (
          <section key={s.id} className={`ms-scene ms-scene--${s.id}`} aria-labelledby={`feature-${s.id}`}>
            <div className="ms-copy">
              <SceneCopy
                scene={s}
                index={i}
                onNavigate={onNavigate}
                headingProps={i === 0 ? { id: 'features-title', tabIndex: -1 } : undefined}
              />
            </div>
            <div className="ms-visual" aria-hidden="true">{VISUALS[i]}</div>
          </section>
        ))}
      </div>

      <section className="ms-final" aria-labelledby="cta-title">
        <div className="ms-final-art" aria-hidden="true">
          <div className="ms-final-disc" />
          <div className="ms-final-helm"><TrojanHelmet className="tmh-helm-svg" /></div>
        </div>
        <div className="ms-final-text">
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
      </section>
    </div>
  );
};

export default StackedStory;
