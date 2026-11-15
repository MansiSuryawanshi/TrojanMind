import React from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import TrojanCrest from './TrojanCrest';

interface HeroProps {
  /** Same destination as the navbar's "Get Started" button. */
  onGetStarted: () => void;
  onExploreFeatures: () => void;
}

const HIGHLIGHTS = ['Brightspace courses', 'Solo or live challenges', 'Exam readiness', 'Adaptive plan', 'Study reports'];

const Hero: React.FC<HeroProps> = ({ onGetStarted, onExploreFeatures }) => (
  <section className="tm-hero relative overflow-hidden" aria-labelledby="hero-title">
    {/* Restrained depth: fine gold grid + soft cardinal wash */}
    <div className="tm-hero-grid absolute inset-0" aria-hidden="true" />
    <div className="tm-hero-wash absolute inset-0" aria-hidden="true" />

    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 grid lg:grid-cols-[1.15fr_1fr] items-center gap-12 lg:gap-16">
      <div className="text-center lg:text-left animate-slide-up">
        <p className="inline-flex items-center gap-2 mb-6 text-xs font-bold uppercase tracking-[0.18em] text-gold">
          <span className="h-px w-8 bg-gold/70" aria-hidden="true" />
          TrojanMind
        </p>
        <h1 id="hero-title" className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-tight text-[color:var(--tm-on-dark)] mb-6">
          Learn together.
          <br />
          <span className="text-gold">Reason deeper.</span>
        </h1>
        <p className="text-lg md:text-xl leading-relaxed text-[color:var(--tm-on-dark-muted)] max-w-xl mx-auto lg:mx-0 mb-10">
          Bring your course materials together, challenge your reasoning with peers, uncover learning gaps, and prepare
          with a personalized study plan.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start">
          <button type="button" onClick={onGetStarted} className="tm-btn-gold w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base group">
            Get Started
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={onExploreFeatures} className="tm-btn-ghost w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base">
            Explore Features
            <ArrowDown size={18} aria-hidden="true" />
          </button>
        </div>

        <ul className="mt-10 flex flex-wrap justify-center lg:justify-start gap-2" aria-label="What's inside">
          {HIGHLIGHTS.map((h) => (
            <li key={h} className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-semibold text-[color:var(--tm-on-dark-muted)]">
              {h}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mx-auto w-full max-w-[230px] sm:max-w-sm lg:max-w-md animate-fade-in anim-delay-2">
        <div className="tm-float">
          <TrojanCrest className="w-full h-auto drop-shadow-[0_24px_40px_rgba(0,0,0,0.45)]" />
        </div>
      </div>
    </div>
  </section>
);

export default Hero;
