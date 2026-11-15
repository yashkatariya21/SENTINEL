"use client";
/**
 * Loads the three-dimensional seal — or decides, honestly, not to.
 *
 * The flat engraved seal is already on the page and is a finished thing. This adds the
 * model on top of it only when: the browser has WebGL, the screen has room, the device
 * has cores to spare, data-saving is off, and motion has not been reduced. The chunk is
 * fetched during idle time, after the hero has painted. If any check fails, nothing is
 * downloaded and nothing is missing.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/motion";

const SealScene = dynamic(() => import("./SealScene"), { ssr: false, loading: () => null });

function canRender3d(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.matchMedia("(min-width: 900px)").matches) return false;

  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    hardwareConcurrency?: number;
  };
  if (nav.connection?.saveData) return false;
  if (nav.connection?.effectiveType && /(^|-)2g$/.test(nav.connection.effectiveType)) return false;
  // A single-core device is not going to enjoy a rotating mesh; two cores is enough for
  // one extruded shape at 1.75x pixel ratio.
  if ((nav.hardwareConcurrency ?? 4) < 2) return false;

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

export function ExtrudedSeal() {
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (reduced || !canRender3d()) return;

    const start = () => setEnabled(true);
    const idle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (idle.requestIdleCallback) {
      const id = idle.requestIdleCallback(start, { timeout: 2500 });
      return () => idle.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(start, 1200);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  const onReady = useCallback(() => setReady(true), []);

  if (!enabled) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 transition-opacity duration-scene ease-settle"
      data-seal3d={ready ? "ready" : "loading"}
      style={{ opacity: ready ? 1 : 0 }}
      aria-hidden="true"
    >
      <SealScene onReady={onReady} />
    </div>
  );
}
