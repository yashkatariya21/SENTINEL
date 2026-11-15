/**
 * The hero's focal object: the seal, struck once as the page settles.
 *
 * Server-rendered SVG, no dependencies, no WebGL — so the hero paints fast and still
 * looks right with JavaScript off, a blocked GPU, or `prefers-reduced-motion`. The
 * heavier three-dimensional treatment is loaded separately and only when it can help.
 */
import { ExtrudedSeal } from "./seal3d/Seal3DLoader";

const RING_TOP = "PRE-PUBLICATION REVIEW";
const RING_BOTTOM = "SIX READERS · NEVER PUBLISHES";

export function SealStage() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      {/* the static seal: this is what search engines, no-JS readers and low-power
          devices get, and it is a finished thing rather than a placeholder. */}
      <div className="seal-stage relative aspect-square animate-[seal-press_720ms_cubic-bezier(0.16,1,0.3,1)_both] motion-reduce:animate-none">
        <svg viewBox="0 0 400 400" className="seal-flat h-full w-full" role="img" aria-label="The Sentinel AI seal: a crest inside a ring of engraving">
          <defs>
            {/* two arcs, so the legend can never collide with itself */}
            <path id="seal-arc-top" d="M200,200 m-158,0 a158,158 0 1,1 316,0" />
            <path id="seal-arc-bottom" d="M200,200 m-158,0 a158,158 0 1,0 316,0" />
            <radialGradient id="seal-face" cx="42%" cy="34%" r="72%">
              <stop offset="0%" stopColor="#F7EBC8" />
              <stop offset="62%" stopColor="#E8D48B" />
              <stop offset="100%" stopColor="#C9A227" />
            </radialGradient>
            <linearGradient id="seal-edge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F3E4AE" />
              <stop offset="100%" stopColor="#8F7418" />
            </linearGradient>
          </defs>

          {/* the disc, with the milled edge of a struck seal */}
          <circle cx="200" cy="200" r="168" fill="url(#seal-edge)" />
          <circle cx="200" cy="200" r="158" fill="url(#seal-face)" />
          <circle cx="200" cy="200" r="158" fill="none" stroke="#8F7418" strokeOpacity="0.45" strokeWidth="1" />

          {/* milled ticks around the rim */}
          <g stroke="#0B1437" strokeOpacity="0.28" strokeWidth="1.4">
            {Array.from({ length: 72 }, (_, i) => {
              const a = (i / 72) * Math.PI * 2;
              const r1 = 150;
              const r2 = i % 6 === 0 ? 139 : 145;
              return (
                <line
                  key={i}
                  x1={200 + Math.cos(a) * r1}
                  y1={200 + Math.sin(a) * r1}
                  x2={200 + Math.cos(a) * r2}
                  y2={200 + Math.sin(a) * r2}
                />
              );
            })}
          </g>

          {/* the ring legend, split across the two halves of the circle */}
          <g fontFamily="var(--font-jetbrains), monospace" fontSize="12.5" letterSpacing="2.6" fill="#0B1437" fillOpacity="0.8">
            <text>
              <textPath href="#seal-arc-top" startOffset="50%" textAnchor="middle">
                {RING_TOP}
              </textPath>
            </text>
            <text>
              <textPath href="#seal-arc-bottom" startOffset="50%" textAnchor="middle">
                {RING_BOTTOM}
              </textPath>
            </text>
          </g>
          {/* the two stops between the arcs */}
          <g fill="#8F7418">
            <circle cx="42" cy="200" r="2.6" />
            <circle cx="358" cy="200" r="2.6" />
          </g>

          {/* the crest, engraved */}
          <g transform="translate(200 200)" fill="none" stroke="#0B1437" strokeOpacity="0.85">
            <circle r="96" strokeOpacity="0.25" />
            <path
              d="M0,-66 L50,-50 L50,-8 C50,26 28,48 0,60 C-28,48 -50,26 -50,-8 L-50,-50 Z"
              strokeWidth="2.2"
            />
            <path d="M0,-38 v58 M-20,-22 h40 M-20,-4 h40 M-20,14 h40" strokeWidth="1.6" strokeOpacity="0.7" />
            <path d="M-96,0 h18 M78,0 h18" strokeWidth="1" strokeOpacity="0.4" />
          </g>

          {/* the gold rule that draws once, then stays */}
          <circle
            cx="200"
            cy="200"
            r="176"
            fill="none"
            stroke="#8F7418"
            strokeWidth="1.6"
            strokeDasharray="1106"
            strokeDashoffset="1106"
            className="animate-[crest-draw_1100ms_cubic-bezier(0.16,1,0.3,1)_180ms_forwards] motion-reduce:[stroke-dashoffset:0]"
          />
        </svg>

        {/* the optional three-dimensional seal, lazily fetched and never blocking */}
        <ExtrudedSeal />

        {/* the shadow under a struck object */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 -bottom-2 h-6 rounded-[50%] bg-navy/20 blur-md"
        />
      </div>

      {/* Everything below the seal is a caption, not a claim. */}
      <div className="mt-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-deep">
          The seal of the Chancery
        </p>
        <p className="mx-auto mt-1.5 max-w-[30ch] text-2xs leading-relaxed text-ink-mute">
          One seal, one charter. The same crest signs every report and every audit entry.
        </p>
      </div>

    </div>
  );
}
