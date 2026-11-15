import React, { useState } from 'react';
import type { GeneratedQuestion } from '../types';

interface QuizQuestionProps {
  question: GeneratedQuestion;
  onAnswer: (answer: string, isCorrect?: boolean) => void;
  disabled?: boolean;
}

const QuizQuestion: React.FC<QuizQuestionProps> = ({ question, onAnswer, disabled }) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Reset state when question changes
  React.useEffect(() => {
    setSelectedOption(null);
    console.log(`[QuizQuestion] Question changed to ${question.id}. Selection reset.`);
  }, [question.id]);

  const handleMcqSubmit = (option: string) => {
    if (disabled) return;
    setSelectedOption(option);
    onAnswer(option, option === question.correctAnswer);
  };

  const options = (question.options || []).filter((o) => String(o).trim().length > 0);

  if (options.length < 2) {
    return (
      <div className="w-full animate-slide-up p-4 rounded-xl border border-danger/25 bg-danger-soft text-danger text-sm">
        This question is missing multiple-choice options. Skip or regenerate the challenge.
      </div>
    );
  }

  return (
    <div className="w-full animate-slide-up">
      {/* Question Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="px-3 py-1 rounded-full bg-cardinal-soft text-cardinal text-[11px] font-bold uppercase tracking-wider border border-cardinal/20">
            Multiple Choice
          </span>
          {question.sourceTopic && (
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
              Topic: {question.sourceTopic}
            </span>
          )}
        </div>
        <h3 className="text-xl md:text-2xl font-bold text-ink leading-snug">
          {question.question}
        </h3>
      </div>

      {/* MCQ Options only — Challenge never uses short answer */}
      <div className="grid grid-cols-1 gap-3">
        {options.map((option, idx) => (
          <button
            key={idx}
            type="button"
            aria-pressed={selectedOption === option}
            onClick={() => handleMcqSubmit(option)}
            disabled={disabled}
            className={`w-full p-4 md:p-5 rounded-xl text-left font-semibold transition-colors border ${
              selectedOption === option
                ? 'bg-cardinal-soft border-cardinal ring-1 ring-cardinal text-ink'
                : 'bg-surface border-line text-ink hover:bg-sunken hover:border-line-strong'
            } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center border text-sm font-bold transition-colors ${
                selectedOption === option ? 'border-cardinal bg-cardinal text-white' : 'border-line-strong text-muted'
              }`}>
                {String.fromCharCode(65 + idx)}
              </div>
              {option}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuizQuestion;
