/**
 * Decorative SVG patterns (inline, small, opacity 4–10%, never behind body text).
 * All are aria-hidden: they carry no information.
 */
export function Damask({ className = "", opacity = 0.07 }: { className?: string; opacity?: number }) {
  return (
    <svg className={className} aria-hidden focusable="false" preserveAspectRatio="none" style={{ opacity }}>
      <defs>
        <pattern id="snt-damask" width="72" height="72" patternUnits="userSpaceOnUse">
          <path d="M36 6c7 9 16 11 16 22s-10 16-16 23c-6-7-16-12-16-23S29 15 36 6z"
                fill="currentColor" opacity="0.5" />
          <circle cx="36" cy="29" r="3.4" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M0 36c9 7 11 16 22 16M72 36c-9 7-11 16-22 16" stroke="currentColor" strokeWidth="1"
                fill="none" opacity="0.6" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#snt-damask)" />
    </svg>
  );
}

export function Lattice({ className = "", opacity = 0.09 }: { className?: string; opacity?: number }) {
  return (
    <svg className={className} aria-hidden focusable="false" preserveAspectRatio="none" style={{ opacity }}>
      <defs>
        <pattern id="snt-lattice" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M0 24 24 0M-6 6 6 -6M18 30 30 18" stroke="currentColor" strokeWidth="0.8" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#snt-lattice)" />
    </svg>
  );
}

/** Art-deco fan for card corners and section headers. */
export function Fan({ className = "", size = 64 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size / 2} viewBox="0 0 64 32" className={className} aria-hidden focusable="false">
      <g stroke="currentColor" fill="none" strokeWidth="0.9">
        {[28, 22, 16, 10].map((r, i) => (
          <path key={r} d={`M3 31a${r} ${r} 0 0 1 ${r * 2} 0`} opacity={0.9 - i * 0.15} />
        ))}
        <path d="M3 31h58" opacity="0.6" />
        <circle cx="32" cy="30" r="1.6" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

/** Guilloche rosette used behind empty states and on the report masthead. */
export function Rosette({ className = "", size = 120 }: { className?: string; size?: number }) {
  const rings = [46, 38, 30, 22];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="0.7">
        {rings.map((r, i) => (
          <circle key={r} cx="50" cy="50" r={r} opacity={0.9 - i * 0.16} />
        ))}
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          return (
            <path key={i}
                  d={`M${50 + Math.cos(a) * 22} ${50 + Math.sin(a) * 22}L${50 + Math.cos(a) * 46} ${50 + Math.sin(a) * 46}`}
                  opacity={i % 2 ? 0.28 : 0.5} />
          );
        })}
        <circle cx="50" cy="50" r="6" opacity="0.8" />
      </g>
    </svg>
  );
}

/** Thin double rule used under page titles. */
export function DoubleRule({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-2 w-full ${className}`} viewBox="0 0 300 8" preserveAspectRatio="none"
         aria-hidden focusable="false">
      <path d="M0 1h300" stroke="currentColor" strokeWidth="0.9" />
      <path d="M0 6h300" stroke="currentColor" strokeWidth="0.5" opacity="0.55" />
      <path d="M150 0l4 4-4 4-4-4 4-4z" fill="currentColor" />
    </svg>
  );
}
