import React from 'react';
import { ArrowRight, Upload } from 'lucide-react';

interface FinalCTAProps {
  onCourses: () => void;
  onUpload: () => void;
}

const FinalCTA: React.FC<FinalCTAProps> = ({ onCourses, onUpload }) => (
  <section className="py-20 md:py-28 px-4 sm:px-6 lg:px-8" aria-labelledby="cta-title">
    <div className="tm-cta relative overflow-hidden max-w-5xl mx-auto rounded-3xl px-6 py-14 sm:px-12 md:py-16 text-center">
      <div className="tm-hero-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative">
        <p className="eyebrow !text-gold mb-4">Ready when you are</p>
        <h2 id="cta-title" className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1] text-[color:var(--tm-on-dark)] mb-5">
          Start with your courses.
        </h2>
        <p className="text-lg text-[color:var(--tm-on-dark-muted)] max-w-xl mx-auto mb-10 leading-relaxed">
          See what’s in each of your Brightspace courses, or upload your own notes and go straight to a challenge.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
          <button type="button" onClick={onCourses} className="tm-btn-gold w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base group">
            Go to My Courses
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex items-center gap-2 py-2 text-sm font-semibold text-[color:var(--tm-on-dark)] underline decoration-gold/60 underline-offset-4 hover:decoration-gold cursor-pointer"
          >
            <Upload size={16} aria-hidden="true" />
            Upload materials instead
          </button>
        </div>
      </div>
    </div>
  </section>
);

export default FinalCTA;
