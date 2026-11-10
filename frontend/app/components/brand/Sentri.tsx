"use client";
/**
 * Sentri the owl — Sentinel's mascot. Original inline SVG, ~3 KB.
 * Mouth/brow animate subtly; everything respects prefers-reduced-motion because the
 * animation is CSS-driven and switched off globally in globals.css.
 */
import { useEffect, useState } from "react";

export type SentriMood =
  | "welcome" | "thinking" | "scanning" | "alert" | "celebrating" | "sleeping" | "confused";

const LABEL: Record<SentriMood, string> = {
  welcome: "Sentri the owl, welcoming you",
  thinking: "Sentri the owl, thinking",
  scanning: "Sentri the owl, reading carefully",
  alert: "Sentri the owl, alert",
  celebrating: "Sentri the owl, celebrating",
  sleeping: "Sentri the owl, resting",
  confused: "Sentri the owl, puzzled",
};

export function Sentri({
  mood = "welcome",
  size = 160,
  decorative = false,
  className = "",
}: {
  mood?: SentriMood;
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const [tilt, setTilt] = useState(0);
  const brow = mood === "alert" || mood === "confused" ? -4 : mood === "thinking" ? 3 : 0;
  const mouth =
    mood === "celebrating" ? "M52 82 Q60 92 68 82"
    : mood === "alert" ? "M54 85 L66 85"
    : mood === "confused" ? "M54 86 Q60 82 66 86"
    : "M54 83 Q60 88 66 83";
  const eyesShut = mood === "sleeping";

  return (
    <svg
      viewBox="0 0 120 132"
      width={size}
      height={(size * 132) / 120}
      className={`transition-transform duration-300 ease-royal motion-reduce:transition-none ${className}`}
      style={{ transform: `rotate(${tilt}deg)` }}
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : LABEL[mood]}
      onMouseEnter={() => setTilt(mood === "sleeping" ? 0 : -3)}
      onMouseLeave={() => setTilt(0)}
      focusable="false"
    >
      {!decorative && <title>Sentri the owl</title>}

      {/* wings */}
      <ellipse cx="22" cy="80" rx="12" ry="24" fill="#1B2A6B" opacity="0.95">
        {mood === "celebrating" && (
          <animateTransform attributeName="transform" type="rotate" values="0 22 80;-14 22 80;0 22 80"
                            dur="0.9s" repeatCount="indefinite" />
        )}
      </ellipse>
      <ellipse cx="98" cy="80" rx="12" ry="24" fill="#1B2A6B" opacity="0.95">
        {mood === "celebrating" && (
          <animateTransform attributeName="transform" type="rotate" values="0 98 80;14 98 80;0 98 80"
                            dur="0.9s" repeatCount="indefinite" />
        )}
      </ellipse>

      {/* body */}
      <ellipse cx="60" cy="82" rx="38" ry="40" fill="#0B1437" />
      <ellipse cx="60" cy="92" rx="24" ry="26" fill="#FBF7EE" />
      <g stroke="#C9A227" strokeWidth="1.5" fill="none" opacity="0.55">
        <path d="M50 94q4 4 8 0" /><path d="M62 94q4 4 8 0" /><path d="M56 104q4 4 8 0" />
      </g>

      {/* ear tufts */}
      <path d="M30 38 24 17 44 30Z" fill="#0B1437" />
      <path d="M90 38 96 17 76 30Z" fill="#0B1437" />

      {/* tiny gold crown */}
      <path d="M44 25 48 11 54 21 60 7 66 21 72 11 76 25Z" fill="#C9A227" stroke="#8F7418" strokeWidth="1.4" />
      <circle cx="60" cy="9" r="2.2" fill="#9B1C31" />

      {/* spectacles + eyes */}
      <circle cx="44" cy="54" r="15" fill="#FBF7EE" stroke="#C9A227" strokeWidth="3" />
      <circle cx="76" cy="54" r="15" fill="#FBF7EE" stroke="#C9A227" strokeWidth="3" />
      <path d="M59 54h2" stroke="#C9A227" strokeWidth="3" />
      {eyesShut ? (
        <g stroke="#0B1437" strokeWidth="2.4" strokeLinecap="round" fill="none">
          <path d="M38 55q6 5 12 0" /><path d="M70 55q6 5 12 0" />
        </g>
      ) : (
        <>
          <circle cx={mood === "thinking" || mood === "scanning" ? 48 : 44}
                  cy={mood === "thinking" ? 50 : 55} r="6" fill="#0B1437">
            <animate attributeName="ry" values="6;6;0.6;6" keyTimes="0;.94;.97;1" dur="5s" repeatCount="indefinite" />
          </circle>
          <circle cx={mood === "thinking" || mood === "scanning" ? 80 : 76}
                  cy={mood === "thinking" ? 50 : 55} r="6" fill="#0B1437" />
          <circle cx="46" cy="52" r="1.7" fill="#FBF7EE" />
          <circle cx="78" cy="52" r="1.7" fill="#FBF7EE" />
        </>
      )}

      {/* brows */}
      <path d={`M32 ${36 + brow}Q44 ${32 + brow} 54 ${37 + brow}`} stroke="#E8D48B" strokeWidth="3"
            fill="none" strokeLinecap="round" />
      <path d={`M66 ${37 + brow}Q76 ${32 + brow} 88 ${36 + brow}`} stroke="#E8D48B" strokeWidth="3"
            fill="none" strokeLinecap="round" />

      {/* beak + mouth */}
      <path d="M54 68 66 68 60 78Z" fill="#C9A227" stroke="#8F7418" strokeWidth="1.2" />
      <path d={mouth} stroke="#8F7418" strokeWidth="2" fill="none" strokeLinecap="round" transform="translate(0,-6)" />

      {/* feet */}
      <g fill="#C9A227"><ellipse cx="48" cy="123" rx="9" ry="4" /><ellipse cx="72" cy="123" rx="9" ry="4" /></g>

      {/* quill (held on the right) */}
      <g transform="translate(92 98) rotate(25)">
        <path d="M0 0C6-14 6-26 0-40C-6-26 -6-14 0 0Z" fill="#FBF7EE" stroke="#1B2A6B" strokeWidth="1.4" />
        <path d="M0 0V-38" stroke="#1B2A6B" strokeWidth="1" />
      </g>

      {/* lantern for 404 / error scenes */}
      {mood === "confused" && (
        <g transform="translate(14 96)">
          <path d="M0 0h14v16H0z" fill="#C9A227" opacity="0.95" />
          <path d="M7 -4v4M-1 16h16" stroke="#8F7418" strokeWidth="1.6" />
          <circle cx="7" cy="8" r="3" fill="#FBF7EE" />
        </g>
      )}
    </svg>
  );
}

/** Speech bubble with typed-out text. Dismissible, and decorative-by-default. */
export function SentriSays({
  children,
  onDismiss,
  mood = "welcome",
  className = "",
}: {
  children: string;
  onDismiss?: () => void;
  mood?: SentriMood;
  className?: string;
}) {
  const [shown, setShown] = useState(children);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(children);
      return;
    }
    setShown("");
    let i = 0;
    const timer = window.setInterval(() => {
      i += 2;
      setShown(children.slice(0, i));
      if (i >= children.length) window.clearInterval(timer);
    }, 18);
    return () => window.clearInterval(timer);
  }, [children]);

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <Sentri mood={mood} size={52} decorative />
      <div className="relative rounded-lg border border-gold/40 bg-ivory px-3 py-2 text-xs leading-relaxed text-ink shadow-card">
        <span aria-hidden className="absolute -left-1.5 top-4 h-2.5 w-2.5 rotate-45 border-b border-l border-gold/40 bg-ivory" />
        <p>{shown}</p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-1 text-2xs font-semibold uppercase tracking-wide text-gold-deep underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-gold"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
