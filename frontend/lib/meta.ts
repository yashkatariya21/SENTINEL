"use client";
/**
 * Product + provider metadata for the status bar.
 *
 * The API already tells the truth about which engine is answering (provider, model,
 * prompt version). Surfacing it is a trust feature, not decoration: a reader can see that
 * the offline deterministic engine is the one producing these findings.
 *
 * Fetched once per page load and shared; failure is not an error the user must act on —
 * the status bar simply shows "unknown" for the fields it could not read.
 */
import { useEffect, useState } from "react";

export interface ApiMeta {
  product: string;
  version: string;
  ai: {
    provider: string;
    model: string;
    embedding_model: string;
    prompt_version: string;
  };
}

let cache: ApiMeta | null = null;
let inflight: Promise<ApiMeta | null> | null = null;

function load(): Promise<ApiMeta | null> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/v1/meta")
      .then((res) => (res.ok ? (res.json() as Promise<ApiMeta>) : null))
      .then((meta) => {
        cache = meta;
        return meta;
      })
      .catch(() => null);
  }
  return inflight;
}

export function useApiMeta(): ApiMeta | null {
  const [meta, setMeta] = useState<ApiMeta | null>(cache);

  useEffect(() => {
    let alive = true;
    load().then((value) => {
      if (alive) setMeta(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  return meta;
}

/** Liveness of the API, polled slowly — the status bar's health dot. */
export function useApiHealth(intervalMs = 30_000): "ok" | "down" | "unknown" {
  const [state, setState] = useState<"ok" | "down" | "unknown">("unknown");

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/v1/meta", { cache: "no-store" });
        if (alive) setState(res.ok ? "ok" : "down");
      } catch {
        if (alive) setState("down");
      }
    };
    void check();
    const timer = window.setInterval(check, intervalMs);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return state;
}
