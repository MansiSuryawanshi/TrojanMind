import React from 'react';

interface FinalCTAProps {
  onUpload: () => void;
}

const FinalCTA: React.FC<FinalCTAProps> = ({ onUpload }) => {
  return (
    <section className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 text-center">
      <div className="max-w-4xl mx-auto animate-slide-up">
        <h2 className="text-4xl md:text-6xl font-extrabold mb-8 tracking-tight leading-[1.1] text-ink">
          Start studying from <br className="hidden sm:block" />
          <span className="text-cardinal">What Actually Matters</span>
        </h2>
        <p className="text-lg md:text-xl text-muted mb-12 max-w-2xl mx-auto">
          Don't wait until the exam to find out what you missed. Upload your material and find your weak areas today.
        </p>

        <button
          type="button"
          onClick={onUpload}
          className="btn-primary w-full sm:w-auto px-10 py-4 rounded-xl font-semibold text-lg"
        >
          Upload Your Material
        </button>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-muted font-semibold uppercase tracking-widest text-xs">
          <span>Syllabus</span>
          <span className="w-1.5 h-1.5 rounded-full bg-gold" aria-hidden="true" />
          <span>Notes</span>
          <span className="w-1.5 h-1.5 rounded-full bg-gold" aria-hidden="true" />
          <span>Slides</span>
          <span className="w-1.5 h-1.5 rounded-full bg-gold" aria-hidden="true" />
          <span>Textbooks</span>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
