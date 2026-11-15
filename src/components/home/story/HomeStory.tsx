import React from 'react';
import { useMediaQuery } from '../useMediaQuery';
import CinematicStory from './CinematicStory';
import StackedStory from './StackedStory';
import '../home.css';
import './story.css';

export interface StoryProps {
  /** Switches to an app tab (see HOME_TABS). */
  onNavigate: (tab: number) => void;
  /** Scrolls to the element with id "features". */
  onExploreFeatures: () => void;
}

/**
 * The landing page. Three presentations of the same content:
 *  - wide screens: one pinned stage with a scroll-scrubbed GSAP timeline;
 *  - phones and tablets: a short pinned hero, then stacked scenes that animate in with scroll;
 *  - reduced motion: the stacked layout with everything in its finished state.
 */
const HomeStory: React.FC<StoryProps> = (props) => {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const wide = useMediaQuery('(min-width: 1024px) and (min-height: 600px)');
  const tall = useMediaQuery('(min-height: 620px)');

  if (reduce) return <StackedStory {...props} mode="static" />;
  if (wide) return <CinematicStory {...props} />;
  return <StackedStory {...props} mode={tall ? 'pinned' : 'flow'} />;
};

export default HomeStory;
