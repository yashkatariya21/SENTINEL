/** Wax-seal badges and role ribbons — the ceremonial status language. */

const TONES = {
  approved: { fill: "#1F6F4A", ink: "#FBF7EE" },
  confirmed: { fill: "#1F6F4A", ink: "#FBF7EE" },
  review: { fill: "#B26A00", ink: "#FBF7EE" },
  critical: { fill: "#9B1C31", ink: "#FBF7EE" },
  navy: { fill: "#1B2A6B", ink: "#FBF7EE" },
  gold: { fill: "#C9A227", ink: "#0B1437" },
} as const;

export function Seal({
  label,
  tone = "gold",
  size = 64,
  spin = false,
}: {
  label: string;
  tone?: keyof typeof TONES;
  size?: number;
  spin?: boolean;
}) {
  const t = TONES[tone];
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false"
           className={spin ? "animate-[spin_18s_linear_infinite] motion-reduce:animate-none" : ""}>
        <defs>
          <radialGradient id={`seal-${tone}`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={t.fill} stopOpacity="0.92" />
            <stop offset="100%" stopColor={t.fill} />
          </radialGradient>
        </defs>
        {/* wax edge */}
        <path
          d="M32 2l6 4 7-1 3 6 6 3-1 7 4 6-4 6 1 7-6 3-3 6-7-1-6 4-6-4-7 1-3-6-6-3 1-7-4-6 4-6-1-7 6-3 3-6 7 1z"
          fill={`url(#seal-${tone})`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.8"
        />
        <circle cx="32" cy="32" r="20" fill="none" stroke={t.ink} strokeWidth="0.8" opacity="0.55" />
      </svg>
      <span
        className="absolute inset-0 grid place-items-center px-2 text-center font-crest font-semibold uppercase leading-tight tracking-wide"
        style={{ color: t.ink, fontSize: Math.max(7, size * 0.14) }}
      >
        {label}
      </span>
    </span>
  );
}

export function Ribbon({ children, tone = "navy" }: { children: React.ReactNode; tone?: "navy" | "gold" | "muted" }) {
  const tones = {
    navy: "bg-navy text-ivory border-gold/40",
    gold: "bg-gradient-gold text-navy border-gold-deep/50",
    muted: "bg-ivory-deep text-ink-soft border-ink/15",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.14em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
