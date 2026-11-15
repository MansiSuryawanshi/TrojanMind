/**
 * Landing screen with pitch headline and "Start session" button.
 * Owner: Developer 1 (Frontend UI)
 */
import React from 'react';

export const LandingScreen: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-4xl font-extrabold tracking-tight text-cardinal mb-2">TrojanMind</h1>
      <p className="text-sm font-semibold text-muted mb-6">Learn together. Reason deeper.</p>
      <p className="text-lg text-ink mb-8">A real-time multiplayer student reasoning evaluator.</p>
      <button type="button" className="btn-primary px-6 py-2.5 rounded-lg font-semibold">
        Start session
      </button>
    </div>
  );
};
