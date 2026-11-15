import React from 'react';

const WhyDifferent: React.FC = () => {
  return (
    <section className="py-20 md:py-24 px-4 sm:px-6 lg:px-8 bg-surface border-y border-line">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-14">
        <div className="flex-1 animate-slide-up">
          <p className="eyebrow mb-4">Why TrojanMind</p>
          <h2 className="text-3xl md:text-5xl font-extrabold mb-6 leading-[1.1] tracking-tight text-ink">
            Stop Studying <br />
            <span className="text-cardinal">Random</span> Content
          </h2>
          <p className="text-lg md:text-xl text-muted mb-10 leading-relaxed">
            Most study apps give you generic questions that don't match your class. TrojanMind is different because it uses YOUR actual coursework.
          </p>

          <ul className="space-y-4">
            {[
              'Built from your real course material',
              'Reveals where you ONLY think you know',
              'Smarter than simple flashcards',
              'High-stakes preparation arena'
            ].map((text, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-cardinal text-gold flex items-center justify-center shrink-0" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </span>
                <span className="text-base md:text-lg font-semibold text-ink">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex-1 w-full max-w-xl animate-fade-in anim-delay-3">
          <div className="surface-raised p-6 sm:p-8 rounded-2xl relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-cardinal" aria-hidden="true" />

            <div className="flex justify-between items-center mb-10 mt-2">
              <div className="text-center flex-1">
                <div className="text-xl sm:text-2xl font-bold text-muted mb-1">Other Apps</div>
                <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Generic Quizzes</p>
              </div>
              <div className="h-12 w-px bg-line" />
              <div className="text-center flex-1">
                <div className="text-xl sm:text-2xl font-bold text-cardinal mb-1">TrojanMind</div>
                <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Your Material</p>
              </div>
            </div>

            <div className="space-y-5">
              {[
                { label: 'Relevance', left: 20, right: 98 },
                { label: 'Depth', left: 40, right: 94 },
                { label: 'Exam Ready', left: 30, right: 96 }
              ].map((row, i) => (
                <div key={i} className="space-y-2">
                  <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
                    {row.label}
                  </div>
                  <div className="flex gap-4 items-center">
                    <div className="flex-1 h-2.5 bg-sunken rounded-full overflow-hidden">
                      <div className="h-full bg-line-strong rounded-full" style={{ width: `${row.left}%` }} />
                    </div>
                    <div className="flex-1 h-2.5 bg-sunken rounded-full overflow-hidden">
                      <div className="h-full bg-cardinal rounded-full" style={{ width: `${row.right}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 text-center p-5 bg-canvas rounded-xl border border-line border-l-4 border-l-gold">
              <p className="text-sm font-medium italic text-ink leading-relaxed">
                "I finally stopped wasting time on questions that aren't on my exam."
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyDifferent;
