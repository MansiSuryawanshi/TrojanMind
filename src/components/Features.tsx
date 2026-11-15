import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CalendarClock, ChartColumn, FolderOpen, Info, Swords, Target, Upload } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { HOME_TABS } from './homeTabs';

type Tone = 'gold' | 'cardinal' | 'charcoal' | 'gold-outline' | 'cardinal-outline';

interface Feature {
  id: string;
  title: string;
  icon: LucideIcon;
  tone: Tone;
  description: string;
  points: string[];
  note?: string;
  cta: { label: string; tab: number };
  secondary?: { label: string; tab: number; icon: LucideIcon };
  span: string;
}

// Every statement here describes behavior that exists in the linked page.
const FEATURES: Feature[] = [
  {
    id: 'courses',
    title: 'Course Materials',
    icon: FolderOpen,
    tone: 'gold',
    description:
      'Browse your Brightspace courses, open each course’s modules, and pick out the materials you want to keep together.',
    points: [
      'Courses grouped by semester',
      'Select items module by module',
      'Prefer your own notes? Paste text or upload a PDF or .txt file',
    ],
    note:
      'Brightspace selections are saved as reference links for this session and aren’t imported into challenges. Linked files, Drive items, or recordings may require separate access.',
    cta: { label: 'Browse My Courses', tab: HOME_TABS.courses },
    secondary: { label: 'Upload materials instead', tab: HOME_TABS.upload, icon: Upload },
    span: 'md:col-span-2 lg:col-span-3',
  },
  {
    id: 'arena',
    title: 'Reasoning Arena',
    icon: Swords,
    tone: 'cardinal',
    description:
      'Turn your uploaded material into a timed question set, then go head-to-head with Claude or with classmates in a live room.',
    points: [
      'Solo vs Claude, or a multiplayer room shared by code or invite link',
      '5, 10, 20, or 50 questions, 60 seconds each',
      'Ranked podium, then review each answer against the ideal answer',
    ],
    cta: { label: 'Enter the Arena', tab: HOME_TABS.challenge },
    span: 'md:col-span-2 lg:col-span-3',
  },
  {
    id: 'exam-prep',
    title: 'Smart Exam Prep',
    icon: Target,
    tone: 'charcoal',
    description: 'See how ready you are based on your past challenges, and pressure-test the topics you’re weakest on.',
    points: [
      'Readiness score and topic coverage from your attempts',
      'Predicted weak areas drawn from your mistakes',
      'Defend a past answer against a follow-up question and get a verdict',
      'Exam-date countdown',
    ],
    cta: { label: 'Open Exam Prep', tab: HOME_TABS.examPrep },
    span: 'lg:col-span-2',
  },
  {
    id: 'schedule',
    title: 'Adaptive Study Schedule',
    icon: CalendarClock,
    tone: 'gold-outline',
    description:
      'Get a day-by-day plan built around the concept gaps in your latest challenge and the time left before your exam.',
    points: [
      'Sessions focused on your weakest topics',
      'A priority gap to tackle first',
      'Regenerate when new results arrive or your exam date changes',
    ],
    note: 'Unlocks after you complete your first challenge.',
    cta: { label: 'View Study Schedule', tab: HOME_TABS.schedule },
    span: 'lg:col-span-2',
  },
  {
    id: 'reports',
    title: 'Study Reports',
    icon: ChartColumn,
    tone: 'cardinal-outline',
    description: 'Keep every quiz you’ve taken in one place and see which way your accuracy is moving.',
    points: [
      'Total quizzes, average accuracy, trend, best and worst scores',
      'Accuracy over time and a per-topic breakdown',
      'Full attempt history, plus optional AI insights on recurring patterns',
    ],
    cta: { label: 'Open Study Report', tab: HOME_TABS.report },
    span: 'md:col-span-2 lg:col-span-2',
  },
];

const TONE_TILE: Record<Tone, string> = {
  gold: 'bg-gold text-ink',
  cardinal: 'bg-cardinal text-gold',
  charcoal: 'bg-[color:var(--tm-charcoal)] text-gold',
  'gold-outline': 'bg-gold-soft text-gold-ink border border-gold/70',
  'cardinal-outline': 'bg-cardinal-soft text-cardinal border border-cardinal/25',
};

interface FeaturesProps {
  onNavigate: (tab: number) => void;
}

const Features: React.FC<FeaturesProps> = ({ onNavigate }) => {
  const reduceMotion = useReducedMotion();

  return (
    <section id="features" className="tm-anchor py-20 md:py-28 px-4 sm:px-6 lg:px-8 bg-canvas" aria-labelledby="features-title">
      <div className="max-w-7xl mx-auto">
        <div className="max-w-2xl mb-12 md:mb-14">
          <p className="eyebrow mb-3">Features</p>
          <h2 id="features-title" tabIndex={-1} className="text-3xl md:text-5xl font-extrabold tracking-tight text-ink mb-4 focus:outline-none">
            One place to study, <span className="text-cardinal">from material to exam day</span>
          </h2>
          <p className="text-lg text-muted leading-relaxed">
            Each feature below is live in the app. Pick one to jump straight in.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.article
                key={f.id}
                aria-labelledby={`feature-${f.id}`}
                className={`tm-feature surface rounded-2xl p-6 md:p-7 flex flex-col ${f.span}`}
                initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: (i % 3) * 0.07 }}
              >
                <span className="tm-feature-line" aria-hidden="true" />
                <div className="flex items-start justify-between gap-4 mb-5">
                  <span className={`w-12 h-12 rounded-xl inline-flex items-center justify-center shrink-0 ${TONE_TILE[f.tone]}`} aria-hidden="true">
                    <Icon size={22} strokeWidth={2.1} />
                  </span>
                  <span className="text-xs font-bold tracking-widest text-muted tabular-nums" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>

                <h3 id={`feature-${f.id}`} className="text-xl font-bold tracking-tight text-ink mb-2">{f.title}</h3>
                <p className="text-muted leading-relaxed mb-5">{f.description}</p>

                <ul className="space-y-2.5 mb-5">
                  {f.points.map((p) => (
                    <li key={p} className="flex gap-3 text-sm text-ink leading-relaxed">
                      <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-gold shrink-0 ring-2 ring-gold/25" aria-hidden="true" />
                      {p}
                    </li>
                  ))}
                </ul>

                {f.note && (
                  <p className="flex gap-2 text-xs text-muted leading-relaxed mb-5 p-3 rounded-lg bg-sunken border border-line">
                    <Info size={14} className="shrink-0 mt-0.5 text-gold-ink" aria-hidden="true" />
                    <span>{f.note}</span>
                  </p>
                )}

                <div className="mt-auto pt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <button
                    type="button"
                    onClick={() => onNavigate(f.cta.tab)}
                    className="btn-secondary px-4 py-2.5 rounded-lg text-sm font-semibold group"
                  >
                    {f.cta.label}
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </button>
                  {f.secondary && (
                    <button
                      type="button"
                      onClick={() => onNavigate(f.secondary!.tab)}
                      className="btn-link inline-flex items-center gap-1.5 text-sm py-2 underline-offset-4 hover:underline"
                    >
                      <f.secondary.icon size={15} aria-hidden="true" />
                      {f.secondary.label}
                    </button>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
