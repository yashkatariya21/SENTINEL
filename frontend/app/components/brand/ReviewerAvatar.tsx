"use client";
/**
 * The committee cast: six stylised bust illustrations in a gold-ringed roundel.
 * Original vector art, ~1.5 KB each, themeable via the character accent colour.
 * Cartoons are decorative — every card also states the reviewer in text.
 */
import { characterFor, type Character } from "./characters";

export type AvatarMood = "idle" | "reviewing" | "flagging" | "approving";

export function ReviewerAvatar({
  reviewer,
  mood = "idle",
  size = 40,
  showRing = true,
  className = "",
}: {
  reviewer: string;
  mood?: AvatarMood;
  size?: number;
  showRing?: boolean;
  className?: string;
}) {
  const c = characterFor(reviewer);
  const lean = mood === "reviewing";
  const thumb = mood === "approving";

  return (
    <svg
      width={size} height={size} viewBox="0 0 64 64"
      className={`shrink-0 ${className}`}
      role="presentation" aria-hidden focusable="false"
    >
      <defs>
        <clipPath id={`clip-${c.key}`}>
          <circle cx="32" cy="32" r={showRing ? 28 : 30} />
        </clipPath>
      </defs>

      {showRing && (
        <>
          <circle cx="32" cy="32" r="31" fill="none" stroke="#C9A227" strokeWidth="1.6" opacity="0.9" />
          <circle cx="32" cy="32" r="28.5" fill="none" stroke="#C9A227" strokeWidth="0.6" opacity="0.5" />
        </>
      )}

      <g clipPath={`url(#clip-${c.key})`}>
        <circle cx="32" cy="32" r="28" fill={c.accentTint} />
        {/* shoulders */}
        <path d="M10 64c2-12 10-17 22-17s20 5 22 17Z" fill={c.accent} opacity="0.9" />
        <path d="M26 47h12v6a6 6 0 0 1-12 0Z" fill={c.skin} />
        {/* head, leaning in while reviewing */}
        <g transform={lean ? "rotate(-4 32 28)" : undefined}>
          <ellipse cx="32" cy="27" rx="13.5" ry="15" fill={c.skin} />
          <Perks c={c} thumb={thumb} />
        </g>
      </g>
      {thumb && (
        <g transform="translate(45 41)">
          <circle r="7" fill="#1F6F4A" />
          <path d="M-2.6 0.4 0 3.2 3.6-2.4" stroke="#FBF7EE" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/** Accessories per character — the visual signature that makes each one recognisable. */
function Perks({ c, thumb }: { c: Character; thumb: boolean }) {
  switch (c.key) {
    case "brand_voice":
      return (
        <>
          {/* silver bob + silk scarf + megaphone brooch */}
          <path d="M18 26c0-9 6-14 14-14s14 5 14 14c0 3-2 4-3 4 1-6-4-9-11-9s-12 3-11 9c-1 0-3-1-3-4Z" fill={c.hair} />
          <path d="M18.5 27c-1 6 0 10 2 13" stroke={c.hair} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M45.5 27c1 6 0 10-2 13" stroke={c.hair} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M24 45c5 3 11 3 16 0l3 6H21Z" fill="#9B1C31" opacity="0.85" />
          <circle cx="32" cy="46" r="2.2" fill="#C9A227" />
          <circle cx="27" cy="26" r="1.5" fill="#1A1A2E" /><circle cx="37" cy="26" r="1.5" fill="#1A1A2E" />
          <path d="M29 32q3 2 6 0" stroke="#8A5A3B" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </>
      );
    case "terminology":
      return (
        <>
          {/* round glasses, bow tie, open dictionary */}
          <path d="M20 24c0-7 5-11 12-11s12 4 12 11c0 3-3 4-12 4s-12-1-12-4Z" fill={c.hair} />
          <circle cx="27" cy="27" r="4.6" fill="none" stroke="#8F7418" strokeWidth="1.6" />
          <circle cx="37" cy="27" r="4.6" fill="none" stroke="#8F7418" strokeWidth="1.6" />
          <path d="M31.6 27h1" stroke="#8F7418" strokeWidth="1.6" />
          <circle cx="27" cy="27" r="1.4" fill="#1A1A2E" /><circle cx="37" cy="27" r="1.4" fill="#1A1A2E" />
          <path d="M28 45h8l2 5h-12Z" fill={c.accent} />
          <path d="M30 48h4" stroke="#E8D48B" strokeWidth="1" />
          <path d="M14 54l9-5 9 3 9-3 9 5" stroke="#8F7418" strokeWidth="1.4" fill="none" opacity="0.9" />
        </>
      );
    case "fact_checker":
      return (
        <>
          {/* deerstalker + magnifying glass */}
          <path d="M17 26c0-9 6-13 15-13s15 4 15 13c0 2-2 3-4 3H21c-2 0-4-1-4-3Z" fill="#6B4A2F" />
          <path d="M18 20h28" stroke="#4E3421" strokeWidth="1.2" />
          <path d="M44 18l7-5M20 18l-7-5" stroke="#4E3421" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="28" cy="30" r="1.6" fill="#1A1A2E" /><circle cx="37" cy="30" r="1.6" fill="#1A1A2E" />
          <path d="M29 36q3 2 6 0" stroke="#8A5A3B" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <g transform="translate(46 40)">
            <circle r="6.5" fill="none" stroke="#C9A227" strokeWidth="2" />
            <path d="M4.6 4.6 9 9" stroke="#C9A227" strokeWidth="2.4" strokeLinecap="round" />
            <circle r="6.5" fill="#FBF7EE" opacity="0.35" />
          </g>
        </>
      );
    case "visual":
      return (
        <>
          {/* beret + palette with swatches */}
          <path d="M16 24c1-8 8-12 16-12s15 4 16 12c-6-3-26-3-32 0Z" fill="#9B1C31" />
          <path d="M32 12v-4" stroke="#9B1C31" strokeWidth="2" strokeLinecap="round" />
          <path d="M20 26c2-4 22-4 24 0" stroke="#7A1626" strokeWidth="1" fill="none" />
          <circle cx="28" cy="30" r="1.6" fill="#1A1A2E" /><circle cx="37" cy="30" r="1.6" fill="#1A1A2E" />
          <path d="M29 35q3 2 6 0" stroke="#8A5A3B" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <g transform="translate(44 42)">
            <path d="M0 0a7 7 0 1 1 6 7 3 3 0 0 1-4-3c0-1.6-1-2.4-2-4Z" fill="#FBF7EE" stroke="#8F7418" strokeWidth="1" />
            <circle cx="-1" cy="3" r="1.3" fill="#1B2A6B" />
            <circle cx="2" cy="-2" r="1.3" fill="#C9A227" />
            <circle cx="5" cy="2" r="1.3" fill="#9B1C31" />
          </g>
        </>
      );
    case "accessibility":
      return (
        <>
          {/* short natural hair + headphones + braille-dot pin */}
          <path d="M19 25c0-8 6-12 13-12s13 4 13 12c-4-4-22-4-26 0Z" fill={c.hair} />
          <path d="M17 26a15 15 0 0 1 30 0" stroke={c.accent} strokeWidth="2.6" fill="none" />
          <rect x="14" y="25" width="5" height="9" rx="2.4" fill={c.accent} />
          <rect x="45" y="25" width="5" height="9" rx="2.4" fill={c.accent} />
          <circle cx="28" cy="30" r="1.6" fill="#1A1A2E" /><circle cx="37" cy="30" r="1.6" fill="#1A1A2E" />
          <path d="M28 35q4 3 8 0" stroke="#4E3421" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <g fill="#C9A227">
            <circle cx="26" cy="47" r="1.1" /><circle cx="29.5" cy="47" r="1.1" />
            <circle cx="26" cy="50" r="1.1" /><circle cx="29.5" cy="50" r="1.1" />
          </g>
        </>
      );
    case "legal":
    default:
      return (
        <>
          {/* judge's curls + gavel + scales pin */}
          <path d="M19 26c0-8 6-12 13-12s13 4 13 12c-3-3-23-3-26 0Z" fill={c.hair} />
          <g fill={c.hair}>
            <circle cx="20" cy="20" r="3" /><circle cx="26" cy="16" r="3" />
            <circle cx="32" cy="15" r="3" /><circle cx="38" cy="16" r="3" /><circle cx="44" cy="20" r="3" />
          </g>
          <circle cx="28" cy="29" r="1.6" fill="#1A1A2E" /><circle cx="37" cy="29" r="1.6" fill="#1A1A2E" />
          <path d="M28 36q4 2 8 0" stroke="#4E3421" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <g transform="translate(45 41) rotate(-20)">
            <rect x="-4" y="-1.5" width="8" height="4" rx="1" fill="#8F7418" />
            <path d="M0 2.5v5" stroke="#8F7418" strokeWidth="1.6" />
          </g>
          <path d="M22 50h8M26 47v6" stroke="#C9A227" strokeWidth="1.1" />
        </>
      );
  }
}
