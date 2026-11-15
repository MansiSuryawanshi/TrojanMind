import React from 'react';

interface HeroProps {
  onStart: () => void;
}

const Hero: React.FC<HeroProps> = ({ onStart }) => {
  return (
    <section className="relative w-full border-b border-line bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 flex flex-col lg:flex-row items-center gap-14">
        {/* Left Content */}
        <div className="flex-1 text-center lg:text-left animate-slide-up">
          <span className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-surface border border-line text-xs font-semibold text-ink">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" aria-hidden="true" />
            Learn together. Reason deeper.
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-6 leading-[1.08] tracking-tight text-ink">
            Turn Your Notes Into <br className="hidden sm:block" />
            <span className="text-cardinal">Smart Exam Practice</span>
          </h1>
          <p className="text-lg md:text-xl text-muted mb-10 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
            Upload syllabus, notes, slides, or study content. TrojanMind turns your real material into focused quizzes, reveals weak areas, and helps you prepare for exams smarter.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start">
            <button
              type="button"
              onClick={onStart}
              className="btn-primary w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base group"
            >
              Start Now
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>

            <button type="button" className="btn-secondary w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base">
              See How It Works
            </button>
          </div>
        </div>

        {/* Right Visual: card stack */}
        <div className="flex-1 w-full max-w-md lg:max-w-lg animate-fade-in anim-delay-2" aria-hidden="true">
          <div className="flex flex-col gap-4 sm:block sm:relative sm:h-[420px]">
            {/* Card 1: Topic Mastery */}
            <div className="sm:absolute sm:top-0 sm:right-0 sm:w-64 surface-raised rounded-2xl p-6 z-30">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-gold-soft text-gold-ink border border-gold/60">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted">Topic Mastery</span>
              </div>
              <div className="text-3xl font-extrabold mb-2 text-ink">92%</div>
              <div className="w-full bg-sunken h-2 rounded-full overflow-hidden">
                <div className="bg-cardinal h-full w-[92%] rounded-full" />
              </div>
              <p className="text-xs text-muted mt-4 font-medium">Strong understanding of SQL Joins</p>
            </div>

            {/* Card 2: AI Quiz Ready */}
            <div className="order-3 sm:absolute sm:bottom-6 sm:left-0 sm:w-64 surface-raised rounded-2xl p-6 z-20">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-cardinal-soft text-cardinal border border-cardinal/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted">AI Quiz Ready</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cardinal" />
                    <div className="h-1.5 flex-1 bg-sunken rounded-full" />
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: Weak Areas Found */}
            <div className="order-2 sm:absolute sm:top-[38%] sm:left-0 sm:-translate-y-1/2 sm:w-56 surface rounded-2xl p-5 z-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-warning-soft text-warning border border-warning/25">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted">Weak Areas Found</span>
              </div>
              <p className="text-sm font-semibold text-ink">Recursion logic needs depth</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
