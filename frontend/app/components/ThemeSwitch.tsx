"use client";
/**
 * Day shift / Night shift.
 *
 * The theme change is a *moment*, not a class swap: a circular reveal expands from the
 * switch across the viewport. Uses the View Transitions API when the browser has it, and
 * falls back to a clip-path overlay driven by the Web Animations API. Under
 * `prefers-reduced-motion` it just changes instantly.
 */
import { useCallback, useRef } from "react";
import { usePrefs } from "@/lib/prefs";
import { useReducedMotion, EASE } from "@/lib/motion";

type StartViewTransition = (callback: () => void) => { finished: Promise<void> };
interface ViewTransitionDocument extends Document {
  startViewTransition?: StartViewTransition;
}

const SURFACE = { light: "#fbf7ee", dark: "#07090d" } as const;

export function ThemeSwitch({ className = "", showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { theme, toggleTheme } = usePrefs();
  const reduced = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const isNight = theme === "dark";

  const changeTheme = useCallback(() => {
    if (busy.current) return;
    const button = buttonRef.current;
    const target = isNight ? "light" : "dark";

    // Reduced motion, or no button geometry (SSR/hydration edge): instantaneous.
    if (reduced || !button) {
      toggleTheme();
      return;
    }

    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const doc = document as ViewTransitionDocument;
    const clipFor = (r: number) => `circle(${r}px at ${x}px ${y}px)`;

    busy.current = true;

    // ── path A: View Transitions API ─────────────────────────────────────────
    if (typeof doc.startViewTransition === "function") {
      const transition = doc.startViewTransition(() => toggleTheme());
      transition.finished.finally(() => {
        busy.current = false;
      });
      // Animate the incoming snapshot from a point to the full viewport. The document
      // element is animated synchronously here, so the paint we capture per frame is the
      // new theme growing out of the switch.
      document.documentElement.animate(
        { clipPath: [clipFor(0), clipFor(radius)] },
        {
          duration: 700,
          easing: EASE.settle,
          pseudoElement: "::view-transition-new(root)",
        } as KeyframeAnimationOptions,
      );
      return;
    }

    // ── path B: clip-path overlay ────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "9999",
      pointerEvents: "none",
      background: SURFACE[target],
      clipPath: clipFor(0),
    });
    document.body.appendChild(overlay);

    const animation = overlay.animate(
      [{ clipPath: clipFor(0) }, { clipPath: clipFor(radius) }],
      { duration: 700, easing: EASE.settle, fill: "forwards" },
    );

    animation.onfinish = () => {
      toggleTheme();              // swap underneath, while the viewport is covered
      const fade = overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 200,
        easing: EASE.royal,
        fill: "forwards",
      });
      fade.onfinish = () => {
        overlay.remove();
        busy.current = false;
      };
    };
  }, [isNight, reduced, toggleTheme]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={changeTheme}
      role="switch"
      aria-checked={isNight}
      aria-label={isNight ? "Night shift is on. Switch to Day shift." : "Day shift is on. Switch to Night shift."}
      title={isNight ? "Night shift" : "Day shift"}
      className={`group inline-flex items-center gap-2 rounded-[3px] border border-[color:var(--hairline)] bg-gradient-to-b from-[#d9bb62] via-gold to-[#a9861c] p-[3px] transition-colors duration-micro hover:border-[color:var(--ink)] ${className}`}
    >
      {/* engraved track */}
      <span className="relative flex h-[22px] w-[42px] items-center rounded-[2px] bg-navy/85 px-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
        <span
          aria-hidden="true"
          className={`grid h-[16px] w-[16px] place-items-center rounded-[1px] bg-gradient-to-b from-[#f2e2ad] to-[#c9a227] shadow-[0_1px_2px_rgba(0,0,0,0.45)] transition-transform duration-ui ease-snap ${
            isNight ? "translate-x-[20px]" : "translate-x-0"
          }`}
        >
          {isNight ? (
            /* engraved moon */
            <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M8.6 1.6a5 5 0 1 0 2.2 6.6 4 4 0 0 1-2.2-6.6Z" fill="#0b1437" opacity="0.85" />
            </svg>
          ) : (
            /* engraved sun */
            <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="6" r="2.4" fill="#0b1437" opacity="0.85" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <rect
                  key={deg}
                  x="5.55" y="0.6" width="0.9" height="1.5" rx="0.4"
                  fill="#0b1437" opacity="0.75"
                  transform={`rotate(${deg} 6 6)`}
                />
              ))}
            </svg>
          )}
        </span>
      </span>
      {showLabel && (
        <span className="pr-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-navy">
          {isNight ? "Night" : "Day"}
        </span>
      )}
    </button>
  );
}
