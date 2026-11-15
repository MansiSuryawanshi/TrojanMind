import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { Scene } from './panels';

interface SceneCopyProps {
  scene: Scene;
  index: number;
  onNavigate: (tab: number) => void;
  /** Extra props for the heading (the first scene carries the "features" focus target). */
  headingProps?: React.HTMLAttributes<HTMLHeadingElement>;
}

/** Step label, masked two-line heading, description, one action and optional extras. */
const SceneCopy: React.FC<SceneCopyProps> = ({ scene, index, onNavigate, headingProps }) => (
  <>
    <p className="st-step js-rest">
      <span>{String(index + 1).padStart(2, '0')}</span>
      {scene.short}
    </p>
    <h2 id={`feature-${scene.id}`} className="st-h2" {...headingProps}>
      {scene.title.map((line) => (
        <span key={line} className="st-mask">
          <span className="st-line js-line">{line}</span>
        </span>
      ))}
    </h2>
    <p className="st-desc js-rest">{scene.description}</p>
    <div className="st-actions js-rest">
      <button type="button" className="tmh-btn tmh-btn--gold" onClick={() => onNavigate(scene.cta.tab)}>
        {scene.cta.label}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      {scene.link && (
        <button type="button" className="st-textlink" onClick={() => onNavigate(scene.link!.tab)}>
          {scene.link.label}
        </button>
      )}
    </div>
    {scene.disclosure && (
      <details className="st-disc js-rest">
        <summary>{scene.disclosure.summary}</summary>
        <p>{scene.disclosure.body}</p>
        {scene.disclosure.link && (
          <button type="button" className="st-textlink" onClick={() => onNavigate(scene.disclosure!.link!.tab)}>
            {scene.disclosure.link.label}
          </button>
        )}
      </details>
    )}
  </>
);

export default SceneCopy;
