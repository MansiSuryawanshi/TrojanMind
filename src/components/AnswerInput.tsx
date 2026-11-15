/**
 * Student answer input: confidence slider, textarea, peer typing indicator, submit button.
 * Owner: Developer 1 (Frontend UI)
 */
import React, { useState } from 'react';

interface AnswerInputProps {
  onSubmit: (answerText: string, confidenceRating: number) => void;
  peerIsTyping: boolean;
}

const AnswerInput: React.FC<AnswerInputProps> = ({ onSubmit, peerIsTyping }) => {
  const [text, setText] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (submitted || text.trim() === '') return;
    setSubmitted(true);
    onSubmit(text.trim(), confidence);
  };

  return (
    <div className="surface rounded-2xl p-5 w-full space-y-4">
      {/* Confidence selector */}
      <div>
        <label className="block text-sm text-ink mb-3 font-medium">
          How confident are you?
        </label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              onClick={() => !submitted && setConfidence(val)}
              disabled={submitted}
              className={[
                'flex-1 py-2 rounded-lg text-sm font-medium border transition-all duration-200 cursor-pointer',
                val === confidence
                  ? 'bg-cardinal border-cardinal text-white'
                  : 'bg-surface border-line-strong text-muted hover:text-ink',
              ].join(' ')}
              aria-pressed={val === confidence}
            >
              {val}
            </button>
          ))}
        </div>
      </div>

      {/* Textarea */}
      <div>
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={submitted}
          placeholder="Type your answer here..."
          className="w-full resize-none rounded-xl p-3 text-sm text-ink bg-surface border border-line-strong placeholder-muted/70 focus:outline-none focus:border-cardinal focus:ring-4 focus:ring-cardinal/10 transition-colors duration-200 disabled:opacity-50"
        />

        {/* Peer typing indicator */}
        {peerIsTyping && !submitted && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-cardinal"
                  style={{ animation: `bounce-dot 1s ease-in-out ${i * 0.15}s infinite` }}
                />
              ))}
            </div>
            <span className="text-cardinal text-xs font-medium">Peer is typing...</span>
          </div>
        )}
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={submitted || text.trim() === ''}
        className="btn-primary w-full py-3 rounded-xl text-sm font-semibold"
      >
        {submitted ? '✓ Submitted' : 'Submit Answer'}
      </button>
    </div>
  );
};

export default AnswerInput;
