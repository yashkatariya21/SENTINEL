"use client";
/**
 * Scroll reveal, done once and cheaply.
 *
 * Elements are visible by default — the hiding class is only applied after mount, so a
 * reader without JavaScript (or a crawler) sees the whole page. One IntersectionObserver
 * serves every block, and under `prefers-reduced-motion` nothing is ever hidden.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/motion";

let observer: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, () => void>();

function observe(el: Element, onEnter: () => void) {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          callbacks.get(entry.target)?.();
          observer?.unobserve(entry.target);
          callbacks.delete(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
  }
  callbacks.set(el, onEnter);
  observer.observe(el);
}

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      setShown(true);
      return;
    }
    // Only arm the animation if the block is still below the fold.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      setShown(true);
      return;
    }
    setArmed(true);
    observe(el, () => setShown(true));
    // Failsafe: whatever happens to the observer, nothing stays invisible for long.
    // A marketing page that swallows its own content on a slow device is worse than
    // a missing fade.
    const failsafe = window.setTimeout(() => setShown(true), 2500);
    return () => {
      window.clearTimeout(failsafe);
      observer?.unobserve(el);
    };
  }, [reduced]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform] duration-reveal ease-settle ${
        armed && !shown ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"
      } ${className}`}
    >
      {children}
    </div>
  );
}
