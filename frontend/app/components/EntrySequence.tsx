"use client";
/**
 * The opening: crest draws, one mono line types, the screen parts like doors.
 *
 * Shown once per browser session, only on the two public routes (/login, /welcome), never
 * inside the app. Skippable from the first frame with a real link, `Esc`, or a click, and
 * skipped automatically under `prefers-reduced-motion`.
 */
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/motion";

const SEEN_KEY = "sentinel.seen.opening";
const LINE = "SENTINEL / reading charter…";

export function EntrySequence() {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"enter" | "part" | "gone">("enter");
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen || reduced) {
      setPhase("gone");
      return;
    }
    setMounted(true);
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode: the sequence simply plays again next visit */
    }

    // type the mono line, 34ms a character
    const typeTimer = window.setInterval(() => {
      setTyped((n) => (n >= LINE.length ? n : n + 1));
    }, 34);

    // 1.5s: doors part; 2.2s: unmount entirely so nothing is left over the page
    const partTimer = window.setTimeout(() => setPhase("part"), 1500);
    const goneTimer = window.setTimeout(() => setPhase("gone"), 2250);

    return () => {
      window.clearInterval(typeTimer);
      window.clearTimeout(partTimer);
      window.clearTimeout(goneTimer);
    };
  }, [reduced]);

  const skip = () => setPhase("gone");

  useEffect(() => {
    if (phase === "gone") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  if (!mounted || phase === "gone") return null;

  return (
    <div className="fixed inset-0 z-[100]" aria-hidden={false} role="presentation">
      {/* two doors, meeting at the middle, that slide apart */}
      <div
        className={`absolute inset-x-0 top-0 h-1/2 bg-navy transition-transform duration-scene ease-settle ${
          phase === "part" ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-5 pb-14">
          <CrestDraw />
        </div>
      </div>
      <div
        className={`absolute inset-x-0 bottom-0 h-1/2 bg-navy transition-transform duration-scene ease-settle ${
          phase === "part" ? "translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="flex h-full items-start justify-center pt-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--ink-3)]">
            {LINE.slice(0, typed)}
            <span className="ml-0.5 inline-block h-3 w-[7px] animate-blink bg-gold-soft/80 align-middle" />
          </p>
        </div>
      </div>

      {/* the closing hairline, drawn once the doors part */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-1/2 h-px origin-left bg-gradient-to-r from-transparent via-gold to-transparent transition-opacity duration-micro ${
          phase === "part" ? "opacity-0" : "opacity-100"
        }`}
      />

      <button
        type="button"
        onClick={skip}
        className="absolute right-5 top-5 rounded-[2px] border border-gold-soft/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-3)] transition-colors duration-micro hover:border-[color:var(--ink)] hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        Skip
      </button>
    </div>
  );
}

/** The crest, drawn by animating stroke-dashoffset once. */
function CrestDraw() {
  return (
    <svg width="72" height="86" viewBox="0 0 48 56" fill="none" aria-hidden="true">
      <path
        d="M24 2.5 44 9v20c0 11.5-8.4 19.6-20 24.5C12.4 48.6 4 40.5 4 29V9L24 2.5Z"
        stroke="#E8D48B"
        strokeWidth="1.4"
        className="[stroke-dasharray:150] [stroke-dashoffset:150] animate-[crest-draw_900ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
      />
      <path
        d="M24 14v18M18 20h12M18 26h12"
        stroke="#C9A227"
        strokeWidth="1.1"
        strokeLinecap="round"
        className="[stroke-dasharray:60] [stroke-dashoffset:60] animate-[crest-draw_700ms_cubic-bezier(0.16,1,0.3,1)_520ms_forwards]"
      />
    </svg>
  );
}
