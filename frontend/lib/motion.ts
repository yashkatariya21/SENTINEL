"use client";
/**
 * Motion tokens and the single gate for every animated thing.
 *
 * Rule: all motion animates `transform` and `opacity` only. No layout properties.
 * Every GSAP / Lenis / WebGL effect in this app must ask `useReducedMotion()` first.
 */
import { useEffect, useState } from "react";

export const EASE = {
  /** the house easing — already used throughout the old UI */
  royal: "cubic-bezier(0.22, 0.61, 0.36, 1)",
  /** long, decelerating settles: reveals */
  settle: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** short, decisive: presses, toggles */
  snap: "cubic-bezier(0.7, 0, 0.2, 1)",
} as const;

export const DUR = {
  micro: 0.14,
  ui: 0.24,
  reveal: 0.7,
  scene: 1.2,
} as const;

export const STAGGER = 0.06; // 60ms between items
export const STAGGER_MAX = 12; // never stagger more than twelve

/** Honour `prefers-reduced-motion`, reactively (users can change it mid-session). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

/** True on touch-first devices — used to hide the custom cursor and pointer parallax. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return coarse;
}

/** Delay for the nth item of a stagger, clamped so long lists stay quick. */
export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER_MAX) * STAGGER;
}
