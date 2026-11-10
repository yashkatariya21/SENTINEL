"use client";
/** Gold ring gauge for the Brand Score. The number is always printed in text too. */
export function BrandScoreRing({ value, size = 96 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img"
           aria-label={`Brand Score ${value} out of 100`} focusable="false">
        <defs>
          <linearGradient id="ring-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E8D48B" />
            <stop offset="55%" stopColor="#C9A227" />
            <stop offset="100%" stopColor="#8F7418" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#0B1437" strokeWidth="9" opacity="0.10" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke="url(#ring-gold)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 50 50)"
          className="transition-[stroke-dasharray] duration-700 ease-royal motion-reduce:transition-none"
        />
        <circle cx="50" cy="50" r="30" fill="none" stroke="#C9A227" strokeWidth="0.6" opacity="0.45" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-2xl font-semibold leading-none text-navy">{pct.toFixed(1)}</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-mute">of 100</p>
        </div>
      </div>
    </div>
  );
}
