"use client";
/**
 * The Review Floor — a floor plan of the committee room.
 *
 * Hover or focus a seat and the beam from the table lights up, showing what that reviewer
 * actually asks. Built from the same six reviewers the API reports, so it cannot drift.
 * The plan is decorative geography; the list beneath it is the real, readable content.
 */
import { useState } from "react";
import { REVIEWERS } from "@/lib/landing";
import { useReducedMotion } from "@/lib/motion";

const SIZE = 100; // viewBox units
const CENTRE = { x: 50, y: 50 };

export function ReviewFloor() {
  const [active, setActive] = useState<string | null>("legal");
  const reduced = useReducedMotion();
  const current = REVIEWERS.find((r) => r.key === active) ?? REVIEWERS[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center">
      {/* ------------------------------------------------------------ the plan */}
      {/* the plan is geography, not content: below lg the list carries it alone */}
      <div className="mx-auto hidden w-full max-w-[520px] lg:block">
      <div className="relative aspect-square w-full">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          {/* the room */}
          <rect x="2" y="2" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="0.3" className="text-[color:var(--ink-3)]" />
          <rect x="6" y="6" width="88" height="88" fill="none" stroke="currentColor" strokeWidth="0.15" className="text-[color:var(--ink-3)]" />
          {/* floor grid */}
          {Array.from({ length: 9 }, (_, i) => (i + 1) * 10).map((v) => (
            <g key={v} className="text-ink/10">
              <line x1={v} y1="6" x2={v} y2="94" stroke="currentColor" strokeWidth="0.12" />
              <line x1="6" y1={v} x2="94" y2={v} stroke="currentColor" strokeWidth="0.12" />
            </g>
          ))}
          {/* the table */}
          <ellipse cx={CENTRE.x} cy={CENTRE.y} rx="15" ry="9" fill="none" stroke="currentColor" strokeWidth="0.4" className="text-[color:var(--ink-2)]/70" />
          <ellipse cx={CENTRE.x} cy={CENTRE.y} rx="12.5" ry="7" fill="currentColor" className="text-ivory-deep/70" />

          {/* beams */}
          {REVIEWERS.map((r) => {
            const on = r.key === active;
            return (
              <line
                key={r.key}
                x1={CENTRE.x}
                y1={CENTRE.y}
                x2={r.x}
                y2={r.y}
                stroke="currentColor"
                strokeWidth={on ? 0.55 : 0.2}
                strokeDasharray={on ? "none" : "1 1.6"}
                className={`origin-center transition-opacity duration-ui ease-royal ${
                  on ? "text-[color:var(--ink-2)] opacity-100" : "text-[color:var(--ink-3)] opacity-30"
                }`}
              />
            );
          })}
        </svg>

        {/* the charter, on the table */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <span aria-hidden="true" className="mx-auto block h-3.5 w-3.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[color:var(--ink-2)]">
              <path d="M12 2 21 5v9c0 4.5-3.8 7.6-9 9-5.2-1.4-9-4.5-9-9V5l9-3Z" />
            </svg>
          </span>
          <p className="mt-0.5 font-mono text-[7px] uppercase tracking-[0.18em] text-[color:var(--ink-2)]">charter</p>
        </div>

        {/* the seats */}
        {REVIEWERS.map((r) => {
          const on = r.key === active;
          return (
            <button
              key={r.key}
              type="button"
              onMouseEnter={() => setActive(r.key)}
              onFocus={() => setActive(r.key)}
              onClick={() => setActive(r.key)}
              aria-pressed={on}
              aria-describedby="floor-caption"
              className="group absolute -translate-x-1/2 -translate-y-1/2 focus-visible:outline-none"
              style={{ left: `${r.x}%`, top: `${r.y}%` }}
            >
              <span
                className={`grid h-[68px] w-[68px] place-items-center rounded-full border transition duration-ui ease-royal group-focus-visible:ring-2 group-focus-visible:ring-gold group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-paper ${
                  on
                    ? "scale-105 border-gold-deep bg-navy text-[#FFE066] shadow-herald"
                    : "border-[color:var(--hairline)] bg-ivory text-ink-soft group-hover:border-[color:var(--ink)]-deep"
                }`}
              >
                <span className="font-crest text-[11px] font-semibold leading-none tracking-[0.06em]">
                  {r.name.split(" ").slice(-1)[0]}
                </span>
              </span>
              <span
                className={`mt-1.5 block whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.16em] transition-colors duration-micro ${
                  on ? "text-[color:var(--ink-2)]" : "text-ink-mute"
                }`}
              >
                {r.role}
              </span>
            </button>
          );
        })}

      </div>

      {/* what the active seat asks — below the plan, never on top of it */}
      <div
        id="floor-caption"
        aria-live="polite"
        className="mt-4 border-t border-[color:var(--hairline)] pt-3 text-center"
      >
        <p
          className={`font-display text-base italic text-navy ${
            reduced ? "" : "animate-[route-rise_420ms_cubic-bezier(0.16,1,0.3,1)]"
          }`}
          key={current.key}
        >
          “{current.question}”
        </p>
        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mute">
          {current.name} · {current.role}
        </p>
      </div>
      </div>

      {/* ------------------------------------------------------- the readable list */}
      <ul className="divide-y divide-[color:var(--hairline)] border-y border-[color:var(--hairline)]">
        {REVIEWERS.map((r, i) => (
          <li key={r.key}>
            <button
              type="button"
              onMouseEnter={() => setActive(r.key)}
              onFocus={() => setActive(r.key)}
              onClick={() => setActive(r.key)}
              className={`flex w-full items-baseline justify-between gap-4 px-1 py-3 text-left transition-colors duration-micro hover:bg-ivory-deep/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                r.key === active ? "bg-ivory-deep/50" : ""
              }`}
            >
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="font-mono text-[10px] tabular-nums text-[color:var(--ink-2)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block font-display text-base font-semibold leading-tight text-navy">{r.name}</span>
                  <span className="block text-xs text-ink-mute">{r.question}</span>
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">
                {r.role}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
