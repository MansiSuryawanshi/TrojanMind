import React from 'react';

/**
 * Decorative hero artwork: a front-facing, crested helmet inside a shield.
 * An original geometric illustration (not an official USC mark).
 * Animation classes live in index.css (`tm-*`) and are disabled under
 * prefers-reduced-motion.
 */

// Plume ridges radiating from beneath the crest, clipped to the crest shape.
const PLUME_LINES = Array.from({ length: 13 }, (_, i) => {
  const angle = (-160 + i * (140 / 12)) * (Math.PI / 180);
  const cx = 200;
  const cy = 190;
  return {
    x1: cx + Math.cos(angle) * 46,
    y1: cy + Math.sin(angle) * 46,
    x2: cx + Math.cos(angle) * 170,
    y2: cy + Math.sin(angle) * 170,
  };
});

const SHIELD = 'M200 18 L362 66 V214 C362 318 292 392 200 426 C108 392 38 318 38 214 V66 Z';
const CREST = 'M126 182 C114 96 156 46 200 44 C244 46 286 96 274 182 C252 158 228 146 200 146 C172 146 148 158 126 182 Z';
const HELMET =
  'M200 132 C248 132 282 170 284 242 L278 318 C274 344 254 360 228 366 L224 298 L210 290 L210 344 L190 344 L190 290 L176 298 L172 366 C146 360 126 344 122 318 L116 242 C118 170 152 132 200 132 Z';

const TrojanCrest: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 400 440" className={className} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="tm-helm" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b80d0d" />
        <stop offset="0.55" stopColor="#990000" />
        <stop offset="1" stopColor="#5e0000" />
      </linearGradient>
      <linearGradient id="tm-crest" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffd94a" />
        <stop offset="1" stopColor="#e0a800" />
      </linearGradient>
      <linearGradient id="tm-shield" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a2424" />
        <stop offset="1" stopColor="#171313" />
      </linearGradient>
      <clipPath id="tm-crest-clip">
        <path d={CREST} />
      </clipPath>
    </defs>

    {/* Orbit rings behind the shield */}
    <g fill="none" stroke="#ffcc00" strokeOpacity="0.14" strokeWidth="1">
      <circle cx="200" cy="222" r="196" />
      <circle cx="200" cy="222" r="172" strokeDasharray="2 7" />
    </g>
    {/* A short gold segment that travels slowly around the outer ring */}
    <circle
      className="tm-orbit"
      cx="200"
      cy="222"
      r="196"
      fill="none"
      stroke="#ffcc00"
      strokeOpacity="0.7"
      strokeWidth="1.5"
      strokeLinecap="round"
      pathLength={100}
      strokeDasharray="6 94"
    />

    {/* Shield */}
    <path d={SHIELD} fill="url(#tm-shield)" />
    <path d={SHIELD} className="tm-trace" fill="none" stroke="#ffcc00" strokeWidth="2.5" strokeLinejoin="round" pathLength={1} />
    <path
      d="M200 38 L344 80 V214 C344 306 282 374 200 406 C118 374 56 306 56 214 V80 Z"
      fill="none"
      stroke="#ffcc00"
      strokeOpacity="0.22"
      strokeWidth="1"
    />

    {/* Crest */}
    <path d={CREST} fill="url(#tm-crest)" />
    <g clipPath="url(#tm-crest-clip)" stroke="#a87a00" strokeOpacity="0.55" strokeWidth="1.6">
      {PLUME_LINES.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
      ))}
    </g>
    <path d={CREST} className="tm-trace tm-trace-delay" fill="none" stroke="#fff3c2" strokeOpacity="0.9" strokeWidth="1.5" pathLength={1} />

    {/* Helmet */}
    <path d={HELMET} fill="url(#tm-helm)" />
    <path d={HELMET} className="tm-trace tm-trace-delay" fill="none" stroke="#ffcc00" strokeWidth="2" strokeLinejoin="round" pathLength={1} />
    {/* Brow band */}
    <path d="M118 236 Q200 212 282 236" fill="none" stroke="#ffcc00" strokeWidth="3" strokeLinecap="round" />
    <path d="M122 250 Q200 228 278 250" fill="none" stroke="#ffcc00" strokeOpacity="0.4" strokeWidth="1" />
    {/* Eye openings */}
    <path d="M138 266 Q168 252 194 262 L194 278 Q166 272 142 284 Z" fill="#171313" />
    <path d="M262 266 Q232 252 206 262 L206 278 Q234 272 258 284 Z" fill="#171313" />
    {/* Highlight on the dome */}
    <path d="M160 160 C176 146 192 142 204 142" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="3" strokeLinecap="round" />
    {/* Rivets */}
    <g fill="#ffcc00">
      <circle cx="140" cy="316" r="3" />
      <circle cx="260" cy="316" r="3" />
    </g>
  </svg>
);

export default TrojanCrest;
