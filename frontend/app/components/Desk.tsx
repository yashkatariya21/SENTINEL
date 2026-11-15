"use client";
/**
 * The furniture of the proof desk: the mark, the stamp, the gate, the pins.
 *
 * These are the product's promise in visual form — a draft is marked up, stamped and
 * held at a gate until a person decides. Every state is written as a word; colour only
 * reinforces it, never carries it alone.
 */
import { Icon } from "./Icon";

/* ------------------------------------------------------------------ the mark */
export function DeskMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <path
        d="M12 2.6 20.5 5.6v6.9c0 4.6-3.4 8.3-8.5 10.3-5.1-2-8.5-5.7-8.5-10.3V5.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <rect x="9.1" y="10.4" width="5.8" height="4.6" rx="1" fill="currentColor" />
      <path d="M10.3 10.4V9.2a1.7 1.7 0 0 1 3.4 0v1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function Wordmark({ tone = "ink", className = "" }: { tone?: "ink" | "paper"; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <DeskMark size={22} className={tone === "paper" ? "text-paper" : "text-ink"} />
      <span
        className={`font-mono text-[13px] font-semibold uppercase tracking-[0.22em] ${
          tone === "paper" ? "text-paper" : "text-ink"
        }`}
      >
        Sentinel
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------- the stamp */
export type StampState = "hold" | "changes" | "approved" | "ready" | "awaiting";

const STAMP: Record<StampState, { word: string; colour: string }> = {
  hold: { word: "Hold", colour: "text-mark-text" },
  changes: { word: "Changes requested", colour: "text-ink" },
  approved: { word: "Approved", colour: "text-confirmed" },
  ready: { word: "Ready", colour: "text-confirmed" },
  awaiting: { word: "Awaiting review", colour: "text-ink-soft" },
};

export function Stamp({
  state,
  large = false,
  drop = false,
  tone = "auto",
  className = "",
}: {
  state: StampState;
  large?: boolean;
  drop?: boolean;
  /** "stock" pins the ink to the light palette: for mock sheets that stay white in both themes. */
  tone?: "auto" | "stock";
  className?: string;
}) {
  const s = STAMP[state];
  const colour = tone === "stock" ? "text-[#C42A1E]" : s.colour;
  return (
    <span
      className={`stamp ${large ? "stamp-lg" : ""} ${drop ? "stamp-drop" : ""} ${colour} ${className}`}
      role="img"
      aria-label={`Stamp: ${s.word}`}
    >
      {s.word}
    </span>
  );
}

/* ------------------------------------------------------------------ the gate */
export const GATE_STEPS = ["Draft", "Six reviewers", "Human decision", "Release (you publish)"] as const;

export function GateStrip({
  current,
  released = false,
  score,
  className = "",
}: {
  /** 0 = draft, 1 = reviewers running, 2 = waiting on a person, 3 = decided */
  current: number;
  released?: boolean;
  score?: number | null;
  className?: string;
}) {
  return (
    <div className={`bg-navy text-paper ${className}`}>
      <ol className="flex items-center gap-1 overflow-x-auto px-3 py-2 sm:gap-2" aria-label="Publication gate">
        {GATE_STEPS.map((label, i) => {
          const done = i < current;
          const now = i === current;
          const locked = i === GATE_STEPS.length - 1 && !released;
          return (
            <li key={label} className="flex shrink-0 items-center gap-1 sm:gap-2">
              <span
                className={`gate-step flex items-center gap-1.5 whitespace-nowrap ${
                  now ? "gate-current" : done ? "text-[#7BE0A8]" : "text-[#9AA1AE]"
                }`}
                aria-current={now ? "step" : undefined}
              >
                {done ? (
                  <Icon name="check" size={13} />
                ) : locked ? (
                  <Icon name="lock" size={13} />
                ) : (
                  <span
                    aria-hidden="true"
                    className={`inline-block h-[6px] w-[6px] rounded-full ${
                      now ? "bg-[#111318]" : "bg-[#9AA1AE]"
                    }`}
                  />
                )}
                {label}
              </span>
              {i < GATE_STEPS.length - 1 && (
                <span aria-hidden="true" className="h-px w-3 bg-[#3A4149] sm:w-6" />
              )}
            </li>
          );
        })}
        {typeof score === "number" && (
          <li className="ml-auto shrink-0 pl-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#9AA1AE]">
              Brand score <span className="text-paper tabular-nums">{score.toFixed(1)}</span>
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------- figures */
export function Figure({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div>
      <span className="block font-mono text-[2rem] font-semibold leading-none tabular-nums text-ink">{value}</span>
      <span className="mt-1 block text-xs text-ink-2">{label}</span>
      {sub && <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">{sub}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------- mascot */
/**
 * Sentri, the desk owl — kept, and put to work. He is the one soft thing on a page of
 * ink rules, so he only appears where he has a job: waiting states, empty states, and
 * the moment a review finishes.
 */
export function DeskSentri({ size = 96, mood = "idle", className = "" }: { size?: number; mood?: "idle" | "reading" | "done"; className?: string }) {
  const eyes = mood === "reading" ? "down" : "level";
  return (
    <svg
      viewBox="0 0 120 110"
      width={size}
      height={(size * 110) / 120}
      className={className}
      role="img"
      aria-label={
        mood === "reading" ? "Sentri the owl, reading the draft" : mood === "done" ? "Sentri the owl, review finished" : "Sentri the owl at the desk"
      }
    >
      {/* body */}
      <ellipse cx="60" cy="66" rx="34" ry="36" fill="var(--ink)" />
      <ellipse cx="60" cy="76" rx="21" ry="23" fill="var(--paper)" />
      {/* ear tufts */}
      <path d="M32 34 26 14 46 27Z" fill="var(--ink)" />
      <path d="M88 34 94 14 74 27Z" fill="var(--ink)" />
      {/* spectacles + eyes */}
      <circle cx="45" cy="46" r="14" fill="var(--paper)" stroke="var(--mark)" strokeWidth="2.4" />
      <circle cx="75" cy="46" r="14" fill="var(--paper)" stroke="var(--mark)" strokeWidth="2.4" />
      <path d="M59 46h2" stroke="var(--mark)" strokeWidth="2.4" />
      {mood === "done" ? (
        <g stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" fill="none">
          <path d="M39 47q6 5 12 0M69 47q6 5 12 0" />
        </g>
      ) : (
        <>
          <circle cx={eyes === "down" ? 47 : 45} cy={eyes === "down" ? 50 : 46} r="5" fill="var(--ink)" />
          <circle cx={eyes === "down" ? 77 : 75} cy={eyes === "down" ? 50 : 46} r="5" fill="var(--ink)" />
        </>
      )}
      {/* beak */}
      <path d="M55 58 65 58 60 66Z" fill="var(--highlight)" stroke="var(--ink)" strokeWidth="1.2" />
      {/* a red pen behind the ear */}
      <g transform="translate(92 30) rotate(28)">
        <rect x="-3" y="-24" width="6" height="26" rx="1.5" fill="var(--mark)" />
        <path d="M-3 2 0 9 3 2Z" fill="var(--ink)" />
      </g>
      {/* highlighter in the left wing */}
      <g transform="translate(22 62) rotate(-16)">
        <rect x="-4" y="-14" width="8" height="22" rx="2" fill="var(--highlight)" stroke="var(--ink)" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

/* --------------------------------------------------------------- the tabs */
/**
 * TabStrip — a row of pressed stamps sharing one ink baseline. Same semantics as
 * before (role=tablist / role=tab / aria-selected), different clothes: the active
 * tab is a solid ink plate, the rest are hairline outlines that darken on hover.
 */
export function TabStrip<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = "",
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex flex-wrap items-center gap-1 border-y border-[color:var(--hairline)] py-2 ${className}`}
    >
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
              on
                ? "border-[color:var(--ink)] bg-[color:var(--ink)] text-[color:var(--paper)]"
                : "border-transparent text-[color:var(--ink-3)] hover:border-[color:var(--hairline-strong)] hover:text-[color:var(--ink)]"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span className={`tabular-nums ${on ? "opacity-70" : "text-[color:var(--ink-3)]"}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
