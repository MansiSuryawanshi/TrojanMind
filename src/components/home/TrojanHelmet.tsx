import React from 'react';

/**
 * Original illustration (not an official USC mark): a front-facing crested
 * Corinthian helmet. Built as a mirrored half with a separate light pass, so the
 * metal reads as sculpted: gold specular ridges, a cardinal bounce light on one
 * edge and deep shadow under the brow.
 *
 * Three layers (`tmh-l-plume`, `tmh-l-helm`, `tmh-l-glint`) are exposed so the
 * hero can shift them by slightly different amounts for pointer depth.
 */

const CX = 300;

// Plume strands radiate from a hidden focal point inside the dome and are clipped
// to the plume silhouette. Generated once, so the markup stays small and exact.
const STRANDS = Array.from({ length: 19 }, (_, i) => {
  const t = i / 18; // 0 = vertical centre, 1 = outer edge
  const theta = t * (Math.PI / 2) * 0.96;
  const ex = CX + Math.sin(theta) * 190;
  const ey = 372 - Math.cos(theta) * 372;
  const bx = CX + t * 60;
  const by = 372;
  // A slight outward bow gives the hair a falling, not ruler-straight, line.
  const qx = bx + (ex - bx) * 0.35 + t * 46;
  const qy = by + (ey - by) * 0.62;
  return {
    d: `M${bx.toFixed(1)} ${by} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
    w: i % 3 === 0 ? 5 : i % 3 === 1 ? 2.4 : 3.4,
    tone: i % 4 === 0 ? 'light' : i % 4 === 2 ? 'dark' : 'mid',
  };
});

const PLUME = 'M300 14 C372 16 448 70 482 176 C506 252 498 330 462 382 L300 382 Z';
const BODY =
  'M300 240 C398 240 466 304 472 400 L474 478 C474 530 466 580 450 624 C432 672 396 714 348 740 C332 748 314 752 300 752 Z';
const OPENING =
  'M300 436 L396 442 C424 448 432 480 422 510 C414 534 404 560 388 600 C372 640 346 690 316 726 L300 734 Z';
const NOSE = 'M300 418 L316 420 C324 462 326 520 318 568 C314 590 306 604 300 612 Z';
const HOLDER = 'M300 232 C340 230 376 244 392 262 L398 292 C372 272 336 266 300 266 Z';

export type HelmetLayer = 'all' | 'plume' | 'body';

const TrojanHelmet: React.FC<{ className?: string; layer?: HelmetLayer; sweep?: boolean }> = ({ className, layer = 'all', sweep = false }) => (
  <svg viewBox="0 0 600 780" className={className} aria-hidden="true" focusable="false">
    <defs>
      {/* Gold: bright on the centre line, rolling off to bronze at the edge. */}
      <linearGradient id="tmh-gold" x1="300" y1="0" x2="476" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fff0a6" />
        <stop offset="0.22" stopColor="#ffd633" />
        <stop offset="0.5" stopColor="#e0a400" />
        <stop offset="0.78" stopColor="#9c6a00" />
        <stop offset="1" stopColor="#5a3a00" />
      </linearGradient>
      {/* Top-down falloff so the dome catches light and the cheeks sink into shade. */}
      <linearGradient id="tmh-fall" x1="0" y1="240" x2="0" y2="752" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fff6c4" stopOpacity="0.3" />
        <stop offset="0.35" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#3a0000" stopOpacity="0.62" />
      </linearGradient>
      <linearGradient id="tmh-plume" x1="0" y1="14" x2="0" y2="382" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#c41212" />
        <stop offset="0.55" stopColor="#8f0000" />
        <stop offset="1" stopColor="#2e0000" />
      </linearGradient>
      <linearGradient id="tmh-opening" x1="0" y1="436" x2="0" y2="734" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#090404" />
        <stop offset="0.7" stopColor="#1a0505" />
        <stop offset="1" stopColor="#4a0000" />
      </linearGradient>
      <linearGradient id="tmh-rim" x1="600" y1="240" x2="420" y2="760" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#ff3b2e" stopOpacity="0.85" />
        <stop offset="1" stopColor="#990000" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="tmh-key" cx="0.3" cy="0.12" r="0.55">
        <stop offset="0" stopColor="#fffbe0" stopOpacity="0.75" />
        <stop offset="1" stopColor="#fffbe0" stopOpacity="0" />
      </radialGradient>
      <filter id="tmh-blur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="5" />
      </filter>
      <filter id="tmh-shadow" x="-20%" y="-10%" width="140%" height="130%">
        <feDropShadow dx="0" dy="26" stdDeviation="22" floodColor="#1a0000" floodOpacity="0.75" />
      </filter>
      <clipPath id="tmh-plume-clip">
        <path d={PLUME} />
        <path d={PLUME} transform={`translate(${CX * 2} 0) scale(-1 1)`} />
      </clipPath>
      <clipPath id="tmh-body-clip">
        <path d={BODY} />
        <path d={BODY} transform={`translate(${CX * 2} 0) scale(-1 1)`} />
      </clipPath>
      <path id="tmh-plume-half" d={PLUME} />
      <path id="tmh-body-half" d={BODY} />
    </defs>

    <g filter="url(#tmh-shadow)">
      {/* ── Plume ─────────────────────────────────────────────── */}
      {layer !== 'body' && (
      <g className="tmh-l-plume">
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? `translate(${CX * 2} 0) scale(-1 1)` : undefined}>
            <use href="#tmh-plume-half" fill="url(#tmh-plume)" />
          </g>
        ))}
        <rect x="297.5" y="16" width="5" height="366" fill="url(#tmh-plume)" />
        <g clipPath="url(#tmh-plume-clip)" fill="none" strokeLinecap="round">
          {[false, true].map((mirror) => (
            <g key={String(mirror)} transform={mirror ? `translate(${CX * 2} 0) scale(-1 1)` : undefined}>
              {STRANDS.map((s, i) => (
                <path
                  key={i}
                  d={s.d}
                  strokeWidth={s.w}
                  stroke={s.tone === 'light' ? '#f0463a' : s.tone === 'dark' ? '#200000' : '#6e0000'}
                  strokeOpacity={s.tone === 'light' ? 0.55 : s.tone === 'dark' ? 0.55 : 0.5}
                />
              ))}
            </g>
          ))}
        </g>
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? `translate(${CX * 2} 0) scale(-1 1)` : undefined}>
            <use href="#tmh-plume-half" fill="none" stroke="#ff5a4a" strokeOpacity="0.5" strokeWidth="2" />
          </g>
        ))}
      </g>

      )}

      {/* ── Helmet body ───────────────────────────────────────── */}
      {layer !== 'plume' && (
      <g className="tmh-l-helm">
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? `translate(${CX * 2} 0) scale(-1 1)` : undefined}>
            <use href="#tmh-body-half" fill="url(#tmh-gold)" />
            <use href="#tmh-body-half" fill="url(#tmh-fall)" />
            <use href="#tmh-body-half" fill="none" stroke="#4a2f00" strokeWidth="3" strokeLinejoin="round" />
          </g>
        ))}

        <rect x="297.5" y="241" width="5" height="196" fill="url(#tmh-gold)" />
        <rect x="297.5" y="728" width="5" height="22" fill="url(#tmh-gold)" />
        <g clipPath="url(#tmh-body-clip)">
          {/* Cheek-guard engraving: two scrolled bands following the jaw */}
          {[false, true].map((mirror) => (
            <g key={String(mirror)} transform={mirror ? `translate(${CX * 2} 0) scale(-1 1)` : undefined} fill="none" strokeLinecap="round">
              <path d="M430 470 C438 540 420 612 372 690" stroke="#4a2f00" strokeOpacity="0.7" strokeWidth="2.5" />
              <path d="M444 472 C454 546 434 622 386 706" stroke="#fff0a6" strokeOpacity="0.5" strokeWidth="1.5" />
              <path d="M410 470 C416 530 400 590 352 662" stroke="#4a2f00" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="1 7" />
              {/* Brow ridge: a raised band above the eyes */}
              <path d="M304 424 L400 430 C428 436 456 456 468 486" stroke="#4a2f00" strokeOpacity="0.8" strokeWidth="3" />
              <path d="M304 417 L402 423 C436 430 462 452 472 480" stroke="#fff6c4" strokeOpacity="0.75" strokeWidth="2" />
              {/* Dome seam */}
              <path d="M300 300 C384 302 436 340 450 410" stroke="#4a2f00" strokeOpacity="0.45" strokeWidth="2" />
              <path d="M300 306 C380 308 430 344 444 410" stroke="#fff0a6" strokeOpacity="0.4" strokeWidth="1.5" />
            </g>
          ))}
          {/* Key light from upper left, one asymmetric pass over the mirrored halves */}
          <ellipse cx="240" cy="330" rx="170" ry="120" fill="url(#tmh-key)" />
          <path d="M214 322 C240 280 280 262 322 258" stroke="#fffbe0" strokeOpacity="0.9" strokeWidth="9" strokeLinecap="round" fill="none" filter="url(#tmh-blur)" />
          {/* Cardinal bounce light along the right edge */}
          <path d="M470 360 C482 480 470 600 394 720" stroke="url(#tmh-rim)" strokeWidth="26" fill="none" filter="url(#tmh-blur)" />
        </g>

        {/* Face opening: deep shadow with a cardinal floor */}
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? `translate(${CX * 2} 0) scale(-1 1)` : undefined}>
            <path d={OPENING} fill="url(#tmh-opening)" />
            <path d={OPENING} fill="none" stroke="#fff0a6" strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round" />
          </g>
        ))}

        {/* Nose guard */}
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? `translate(${CX * 2} 0) scale(-1 1)` : undefined}>
            <path d={NOSE} fill="url(#tmh-gold)" />
            <path d={NOSE} fill="none" stroke="#4a2f00" strokeWidth="2.5" strokeLinejoin="round" />
          </g>
        ))}
        <path d="M300 424 L300 600" stroke="#fff6c4" strokeOpacity="0.8" strokeWidth="2" />

        {/* Crest holder */}
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? `translate(${CX * 2} 0) scale(-1 1)` : undefined}>
            <path d={HOLDER} fill="url(#tmh-gold)" stroke="#4a2f00" strokeWidth="3" strokeLinejoin="round" />
            <path d="M306 244 C338 242 366 252 382 268" fill="none" stroke="#fff6c4" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" />
            <g stroke="#4a2f00" strokeOpacity="0.6" strokeWidth="2">
              <line x1="326" y1="238" x2="326" y2="272" />
              <line x1="350" y1="241" x2="352" y2="276" />
              <line x1="374" y1="250" x2="378" y2="282" />
            </g>
          </g>
        ))}

        {/* Rivets */}
        <g fill="#fff0a6" stroke="#4a2f00" strokeWidth="1.5">
          {[
            [452, 470],
            [440, 560],
            [400, 646],
          ].flatMap(([x, y]) => [
            <circle key={`r${x}`} cx={x} cy={y} r="5" />,
            <circle key={`l${x}`} cx={CX * 2 - x} cy={y} r="5" />,
          ])}
        </g>
      </g>

      )}

      {/* ── Glints ────────────────────────────────────────────── */}
      {layer !== 'plume' && (
      <>
      {sweep && (
        <g clipPath="url(#tmh-body-clip)">
          <g className="tmh-sweep">
            <path d="M-120 200 L-40 200 L60 800 L-20 800 Z" fill="#fff6c4" opacity="0.38" filter="url(#tmh-blur)" />
          </g>
        </g>
      )}
      <g className="tmh-l-glint" fill="#fffbe0">
        <path d="M238 276 L242 262 L246 276 L260 280 L246 284 L242 298 L238 284 L224 280 Z" opacity="0.95" />
        <path d="M418 352 L421 344 L424 352 L432 355 L424 358 L421 366 L418 358 L410 355 Z" opacity="0.6" />
      </g>
      </>
      )}
    </g>
  </svg>
);

export default TrojanHelmet;
