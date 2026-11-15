/** The phrases the reviewers really flag, in a single slow band.
 *
 *  Every item is lifted from the labelled sample set the test suite runs against
 *  (backend/seed/samples.py) — none of it was written for this page.
 */
import { FLAGGED_PHRASES } from "@/lib/landing";

function Half({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul
      className="marquee-half flex shrink-0 items-center gap-8 pr-8"
      aria-hidden={hidden || undefined}
    >
      {FLAGGED_PHRASES.map((item, i) => (
        <li key={`${hidden ? "b" : "a"}-${i}`} className="flex shrink-0 items-baseline gap-2.5">
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gold-deep/70" />
          <span className="font-display text-lg italic text-ink-soft">“{item.phrase}”</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--ink-2)]">
            {item.reviewer}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Marquee() {
  return (
    <div className="marquee relative overflow-hidden border-y border-[color:var(--hairline)] bg-ivory-deep/50 py-4">
      <div className="marquee-track flex w-max">
        <Half />
        <Half hidden />
      </div>
      {/* the fades that keep the band from colliding with the page edge */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-paper to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-paper to-transparent" />
    </div>
  );
}
