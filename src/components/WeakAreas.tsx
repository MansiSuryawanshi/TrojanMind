/**
 * WeakAreas – predicted weak-area gap tags (coral style, matching quiz tab ConceptGapTags).
 * Owner: Developer 3 (Exam Prep)
 */
import React from 'react';
import { useStore } from '../store/store';
import { topicEvidence } from '../services/analyticsService';

interface Props {
  onSelectTopic?: (topic: string) => void;
}

/** Academic topics with missed questions, each with the evidence behind it. */
export const WeakAreas: React.FC<Props> = ({ onSelectTopic }) => {
  const weakAreas = useStore((s) => s.weakAreas);
  const topicProgress = useStore((s) => s.topicProgress);
  const attemptCount = useStore((s) => s.allAttempts.length);
  const notAssessed = topicProgress.filter((t) => t.percentage == null);

  return (
    <div className="ep-card weak-areas-card">
      <div className="ep-card-header">
        <h3 className="ep-card-title">Topics to review</h3>
        <span className="ep-card-subtitle">From questions you missed</span>
      </div>

      {weakAreas.length === 0 ? (
        <p className="weak-areas-explanation">No missed questions on course topics yet.</p>
      ) : (
        <div className="gap-tags-row">
          {weakAreas.map((area: string, idx: number) => {
            const p = topicProgress.find((t) => t.name === area);
            return (
              <button
                key={idx}
                className="gap-tag"
                onClick={() => onSelectTopic?.(area)}
                title={p ? `${topicEvidence(p)}. Click to practice explaining this topic.` : 'Click to practice explaining this topic.'}
              >
                <span className="gap-tag-icon">⚠</span>
                {area}
                {p && (p.answered ?? 0) > 0 && (
                  <span className="text-[10px] font-semibold opacity-80 ml-1">
                    {p.correct ?? 0}/{p.answered}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <p className="weak-areas-explanation">
        Based on {attemptCount} quiz{attemptCount === 1 ? '' : 'zes'}. Numbers show correct answers out of questions
        answered; unanswered questions aren’t counted as wrong here.
        {attemptCount < 3 ? ' These are early results.' : ''}
      </p>
      {notAssessed.length > 0 && (
        <p className="weak-areas-explanation">
          Not assessed (every question unanswered): {notAssessed.map((t) => t.name).join(', ')}.
        </p>
      )}

      {onSelectTopic && weakAreas.length > 0 && (
        <p className="weak-areas-hint">
          Click a topic to practice explaining it in a follow-up question.
        </p>
      )}
    </div>
  );
};
