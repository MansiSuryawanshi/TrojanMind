import React from 'react';

const Features: React.FC = () => {
  const features = [
    {
      title: 'Quizzes from Material',
      description: 'TrojanMind generates focused challenges directly from your syllabus, notes, or slides.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <path d="M12 18l3.5-3.5L12 11l-3.5 3.5L12 18z"></path>
        </svg>
      ),
    },
    {
      title: 'Weak Topic Detection',
      description: 'Identify exactly where your understanding is weak before the exam hits.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m15 9-6 6"></path>
          <path d="m9 9 6 6"></path>
        </svg>
      ),
    },
    {
      title: 'Confidence Tracker',
      description: 'Compare how confident you feel with how you actually perform on challenges.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20v-6"></path>
          <path d="M6 20V10"></path>
          <path d="M18 20V4"></path>
        </svg>
      ),
    },
    {
      title: 'Smart Revision',
      description: 'Get a personalized roadmap of what to study based on your real performance.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      ),
    },
  ];

  return (
    <section className="py-20 md:py-24 px-4 sm:px-6 lg:px-8 bg-surface border-b border-line">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14 animate-slide-up">
          <p className="eyebrow mb-3">What it does</p>
          <h2 className="text-3xl md:text-5xl font-extrabold mb-5 tracking-tight text-ink">
            What TrojanMind <span className="text-cardinal">Actually Does</span>
          </h2>
          <p className="text-muted max-w-2xl mx-auto text-lg">
            We don't do generic rote memorization. We reveal hidden gaps in your understanding.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((feature, i) => (
            <div
              key={i}
              className={`surface card-hover p-7 rounded-2xl group animate-fade-in anim-delay-${i + 1}`}
            >
              <div className="mb-5 p-3 rounded-xl bg-cardinal-soft text-cardinal inline-flex">
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold mb-3 tracking-tight text-ink">
                {feature.title}
              </h3>
              <p className="text-muted leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
