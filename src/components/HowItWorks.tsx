import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarClock, ClipboardCheck, FolderOpen, Swords } from 'lucide-react';

const STEPS = [
  {
    title: 'Choose materials',
    description: 'Browse your Brightspace courses, or upload your own notes as text, a PDF, or a .txt file.',
    icon: FolderOpen,
  },
  {
    title: 'Practice and challenge',
    description: 'Take a timed challenge built from your material, solo against Claude or live with classmates.',
    icon: Swords,
  },
  {
    title: 'Review feedback',
    description: 'Compare your answers with the ideal answers, then work through your weak areas in Exam Prep.',
    icon: ClipboardCheck,
  },
  {
    title: 'Plan your preparation',
    description: 'Follow an adaptive schedule toward your exam date and track progress in your Study Report.',
    icon: CalendarClock,
  },
];

const HowItWorks: React.FC = () => {
  const reduceMotion = useReducedMotion();

  return (
    <section className="py-20 md:py-24 px-4 sm:px-6 lg:px-8 bg-surface border-y border-line" aria-labelledby="how-title">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-2xl mb-12 md:mb-16">
          <p className="eyebrow mb-3">How it works</p>
          <h2 id="how-title" className="text-3xl md:text-5xl font-extrabold tracking-tight text-ink">
            Four steps, <span className="text-cardinal">one study loop</span>
          </h2>
        </div>

        <div className="relative">
        {/* Gold connector traced across the steps on desktop */}
        <div className="hidden lg:block absolute top-7 left-14 right-14 h-px pointer-events-none" aria-hidden="true">
          <span className="tm-connector block h-full" />
        </div>
        <ol className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">

          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.li
                key={step.title}
                className="relative"
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.08 }}
              >
                <div className="relative z-10 mb-6 w-14 h-14 rounded-2xl bg-[color:var(--tm-charcoal)] text-gold flex items-center justify-center ring-4 ring-surface" aria-hidden="true">
                  <Icon size={22} />
                </div>
                <p className="text-xs font-bold text-gold-ink mb-2 uppercase tracking-widest">Step {i + 1}</p>
                <h3 className="text-xl font-bold mb-2 tracking-tight text-ink">{step.title}</h3>
                <p className="text-muted leading-relaxed">{step.description}</p>
              </motion.li>
            );
          })}
        </ol>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
