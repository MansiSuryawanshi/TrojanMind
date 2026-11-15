/**
 * TopicCoverage – animated progress bars for each study topic.
 * Color rules: >75% green (strong), 50–75% amber, <50% red.
 * Click a topic to focus it on the readiness path / cross-exam.
 * Owner: Developer 3 (Exam Prep)
 */
import React, { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import type { TopicProgress } from '../types';

interface Props {
  focusTopic?: string | null;
  onSelectTopic?: (topic: string) => void;
}

export const TopicCoverage: React.FC<Props> = ({ focusTopic = null, onSelectTopic }) => {
  const topics = useStore((s) => s.topicProgress);
  // Animate bars in on mount
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const getBarColor = (pct: number) => {
    if (pct > 75) return 'var(--success)';      // strong
    if (pct >= 50) return 'var(--amber)';        // amber
    return 'var(--danger)';                      // red
  };

  const getBadge = (pct: number) => {
    if (pct > 75) return { label: 'Strong', cls: 'badge-green' };
    if (pct >= 50) return { label: 'Moderate', cls: 'badge-amber' };
    return { label: 'Weak', cls: 'badge-red' };
  };

  return (
    <div className="ep-card">
      <div className="ep-card-header">
        <h3 className="ep-card-title">Topic Coverage</h3>
        <span className="ep-card-subtitle">
          {topics.length} topics · click a bar to focus
        </span>
      </div>

      <div className="topic-list">
        {topics.map((topic: TopicProgress, idx: number) => {
          if (topic.percentage == null) {
            return (
              <div key={idx} className="topic-row">
                <div className="topic-meta">
                  <span className="topic-name">{topic.name}</span>
                  <span className="topic-badge">Not assessed</span>
                </div>
              </div>
            );
          }
          const pct = topic.percentage;
          const badge = getBadge(pct);
          const active = focusTopic === topic.name;
          return (
            <button
              key={idx}
              type="button"
              className={`topic-row topic-row--clickable${active ? ' topic-row--focus' : ''}`}
              onClick={() => onSelectTopic?.(topic.name)}
              title="Focus this topic on your study path"
            >
              <div className="topic-meta">
                <span className="topic-name">{topic.name}</span>
                <span className={`topic-badge ${badge.cls}`}>{badge.label}</span>
              </div>

              <div className="topic-bar-wrap">
                <div className="topic-bar-track">
                  <div
                    className="topic-bar-fill"
                    style={{
                      width: mounted ? `${pct}%` : '0%',
                      backgroundColor: getBarColor(pct),
                      transitionDelay: `${idx * 80}ms`,
                    }}
                  />
                </div>
                <span
                  className="topic-pct"
                  style={{ color: getBarColor(pct) }}
                >
                  {pct}%
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
