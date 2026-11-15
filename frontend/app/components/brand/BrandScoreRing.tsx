"use client";
/**
 * Brand Score gauge — an ink arc on a hairline track, with tick marks at every tenth
 * so the reading can be judged against the scale, not just against itself. The number
 * is always printed in text too, because an arc alone is not a value.
 */
export function BrandScoreRing({ value, size = 96 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={`Brand Score ${value} out of 100`}
        focusable="false"
      >
        {/* the track */}
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--hairline)" strokeWidth="8" />
        {/* tenths, printed around the track like a dial */}
        {Array.from({ length: 10 }).map((_, i) => {
          const a = (i / 10) * 2 * Math.PI - Math.PI / 2;
          return (
            <line
              key={i}
              x1={50 + Math.cos(a) * 46}
              y1={50 + Math.sin(a) * 46}
              x2={50 + Math.cos(a) * 49}
              y2={50 + Math.sin(a) * 49}
              stroke="var(--hairline)"
              strokeWidth="1.4"
            />
          );
        })}
        {/* the reading, in ink */}
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="8"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 50 50)"
          className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
        />
        {/* the mark where it ends */}
        <circle
          cx={50 + Math.cos((pct / 100) * 2 * Math.PI - Math.PI / 2) * r}
          cy={50 + Math.sin((pct / 100) * 2 * Math.PI - Math.PI / 2) * r}
          r="2.6"
          fill="var(--mark)"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-mono text-2xl font-semibold leading-none tabular-nums text-[color:var(--ink)]">
            {pct.toFixed(1)}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--ink-3)]">of 100</p>
        </div>
      </div>
    </div>
  );
}
