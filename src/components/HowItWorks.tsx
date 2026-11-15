import React from 'react';

const HowItWorks: React.FC = () => {
  const steps = [
    {
      number: '01',
      title: 'Upload Material',
      description: 'Upload your syllabus, notes, slides, or plain text content.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
      )
    },
    {
      number: '02',
      title: 'Extract Topics',
      description: 'Our AI analyzes your material and pulls out exactly what you need to know.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v8"></path><path d="m4.93 10.93 1.41 1.41"></path><path d="M2 18h2"></path><path d="M20 18h2"></path><path d="m19.07 10.93-1.41 1.41"></path><path d="M22 22H2"></path><path d="m16 6-4 4-4-4"></path><path d="M16 18a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"></path></svg>
      )
    },
    {
      number: '03',
      title: 'Generate Challenges',
      description: 'You get a series of focused reasoning challenges built from your material.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m12 14 4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path></svg>
      )
    },
    {
      number: '04',
      title: 'Improve Results',
      description: 'See exactly where you are weak and prepare smarter for the real exam.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
      )
    }
  ];

  return (
    <section className="py-20 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-14 animate-slide-up">
          <p className="eyebrow mb-3">How it works</p>
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight text-ink">
            Smart Learning <span className="text-cardinal">Simplified</span>
          </h2>
          <p className="text-muted text-lg">Four steps to better exam results.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 relative">
          {/* Connector line (desktop) */}
          <div className="hidden lg:block absolute top-8 left-16 right-16 h-px bg-line" aria-hidden="true" />

          {steps.map((step, i) => (
            <div key={i} className="relative z-10 animate-fade-in" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="mb-6 w-16 h-16 rounded-2xl surface flex items-center justify-center text-cardinal">
                {step.icon}
              </div>
              <div className="text-xs font-bold text-gold-ink mb-2 uppercase tracking-widest">Step {step.number}</div>
              <h3 className="text-xl font-bold mb-3 tracking-tight text-ink">{step.title}</h3>
              <p className="text-muted leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
