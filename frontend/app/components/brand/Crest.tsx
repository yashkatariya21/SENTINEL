/**
 * Sentinel brand primitives — original inline SVG.
 * Each is themeable via `currentColor` / CSS variables, has a <title> and works in
 * light and dark mode. Keep these under 3 KB each.
 */
import type { CSSProperties } from "react";

type Tone = "gold" | "navy" | "ivory" | "mono";

const TONES: Record<Tone, { line: string; fill: string; accent: string }> = {
  gold: { line: "#C9A227", fill: "#0B1437", accent: "#E8D48B" },
  navy: { line: "#0B1437", fill: "#FBF7EE", accent: "#C9A227" },
  ivory: { line: "#FBF7EE", fill: "transparent", accent: "#E8D48B" },
  mono: { line: "currentColor", fill: "none", accent: "currentColor" },
};

/* --------------------------------------------------------------------- crest */
export function Crest({
  size = 40,
  tone = "gold",
  title = "Sentinel AI crest",
  decorative = false,
  className = "",
}: {
  size?: number;
  tone?: Tone;
  title?: string;
  decorative?: boolean;
  className?: string;
}) {
  const c = TONES[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 76"
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
      className={className}
      focusable="false"
    >
      {!decorative && <title>{title}</title>}
      {/* shield */}
      <path d="M32 3 58 11v27c0 16-11 27-26 33C17 65 6 54 6 38V11L32 3z"
            fill={c.fill} stroke={c.line} strokeWidth="2.2" strokeLinejoin="round" />
      {/* laurel */}
      <g stroke={c.accent} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.9">
        <path d="M14 30c-4 6-4 14 0 20" />
        <path d="M50 30c4 6 4 14 0 20" />
        <path d="M14 33l-4-3M14 39l-4-3M14 45l-4-3" />
        <path d="M50 33l4-3M50 39l4-3M50 45l4-3" />
      </g>
      {/* lowercase s */}
      <text
        x="32" y="47"
        textAnchor="middle"
        fontFamily="var(--font-cormorant), Georgia, serif"
        fontSize="30" fontWeight="700" fill={c.line}
      >
        s
      </text>
      {/* chief */}
      <path d="M32 3 58 11" stroke={c.accent} strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ wordmark */
export function Wordmark({ tone = "gold", size = 22 }: { tone?: Tone; size?: number }) {
  const c = TONES[tone];
  return (
    <span className="inline-flex flex-col leading-none">
      <span
        className="font-crest font-semibold tracking-[0.14em]"
        style={{ fontSize: size, color: c.line === "currentColor" ? undefined : c.line }}
      >
        SENTINEL AI
      </span>
      <svg width={size * 5.2} height="4" aria-hidden focusable="false" className="mt-1">
        <path d={`M0 2h${size * 5.2}`} stroke={c.accent} strokeWidth="1" opacity="0.8" />
        <circle cx={size * 2.6} cy="2" r="1.6" fill={c.accent} />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ monogram */
export function Monogram({ size = 32, tone = "gold" }: { size?: number; tone?: Tone }) {
  const c = TONES[tone];
  const stars = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    // round so server and client render byte-identical coordinates
    return { x: Number((32 + Math.cos(angle) * 25).toFixed(2)), y: Number((32 + Math.sin(angle) * 25).toFixed(2)) };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Sentinel AI monogram" focusable="false">
      <title>Sentinel AI monogram</title>
      <circle cx="32" cy="32" r="30" fill={c.fill} stroke={c.line} strokeWidth="2" />
      <circle cx="32" cy="32" r="24" fill="none" stroke={c.accent} strokeWidth="0.8" opacity="0.7" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={i % 3 === 0 ? 1.5 : 1} fill={c.accent} />
      ))}
      <text x="32" y="42" textAnchor="middle" fontFamily="var(--font-cormorant), Georgia, serif"
            fontSize="26" fontWeight="700" fill={c.line}>
        S
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------- divider */
export function PatternDivider({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-3 w-full ${className}`} viewBox="0 0 200 12" preserveAspectRatio="none"
         aria-hidden focusable="false">
      <path d="M0 6h72" stroke="currentColor" strokeWidth="0.8" />
      <path d="M128 6h72" stroke="currentColor" strokeWidth="0.8" />
      <path d="M100 1l7 5-7 5-7-5 7-5z" fill="none" stroke="currentColor" strokeWidth="0.9" />
      <circle cx="86" cy="6" r="1.4" fill="currentColor" />
      <circle cx="114" cy="6" r="1.4" fill="currentColor" />
    </svg>
  );
}

/* -------------------------------------------------------------- corner fan */
export function CornerFan({ size = 56, className = "", style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" className={className} style={style}
         aria-hidden focusable="false">
      <g stroke="currentColor" fill="none" strokeWidth="0.9">
        <path d="M2 2v26M2 2h26" />
        <path d="M8 2a22 22 0 0 1 22 22" opacity="0.8" />
        <path d="M14 2a14 14 0 0 1 14 14" opacity="0.6" />
        <path d="M2 8a22 22 0 0 0 22 22" opacity="0.5" />
      </g>
      <circle cx="6" cy="6" r="1.8" fill="currentColor" />
    </svg>
  );
}
