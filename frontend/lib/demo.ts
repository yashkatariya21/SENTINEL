"use client";
/** One-click demo: shared client state for the loader button, progress panel and tour. */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, setToken } from "@/lib/api";
import { DEMO_USERS } from "@/lib/auth";

export type DemoState = "idle" | "loading" | "running" | "done" | "error";

export interface DemoStatus {
  state: DemoState;
  phase: string;
  total: number;
  analysed: number;
  findings: number;
  started_at: string | null;
  finished_at: string | null;
  errors: string[];
  demo_mode: boolean;
}

const EMPTY: DemoStatus = {
  state: "idle", phase: "", total: 0, analysed: 0, findings: 0,
  started_at: null, finished_at: null, errors: [], demo_mode: true,
};

/** Poll /v1/demo/status once a second while a load is in flight. */
export function useDemoStatus(enabled: boolean) {
  const [status, setStatus] = useState<DemoStatus>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.get<DemoStatus>("/demo/status");
      setStatus(next);
      return next;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return { status, setStatus, error, refresh };
}

/** POST /demo/load, then sign in as the demo Manager so the app is immediately usable. */
export function useDemoLoader() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DemoStatus>(EMPTY);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  /** Sign in as the demo Manager with a server-minted token.
   *
   *  No password: seeded demo users have no fixed one, so posting a hard-coded
   *  value can only 401. `/demo/session` issues the token itself.
   */
  const signInAsDemoManager = useCallback(async () => {
    const manager = DEMO_USERS.find((u) => u.primary) ?? DEMO_USERS[0];
    const res = await api.post<{ access_token: string }>(
      `/demo/session?as_email=${encodeURIComponent(manager.email)}`,
    );
    setToken(res.access_token);
    return manager;
  }, []);

  const load = useCallback(
    async (opts: { background?: boolean } = {}) => {
      setBusy(true);
      setError(null);
      try {
        const started = await api.post<DemoStatus & { started: boolean }>(
          `/demo/load?background=${opts.background === false ? "false" : "true"}`,
        );
        setStatus(started);
        await signInAsDemoManager();

        // poll until the workspace is ready, then resolve
        return await new Promise<DemoStatus>((resolve, reject) => {
          let attempts = 0;
          stopPolling();
          pollRef.current = window.setInterval(async () => {
            attempts += 1;
            try {
              const next = await api.get<DemoStatus>("/demo/status");
              setStatus(next);
              if (next.state === "done") {
                stopPolling();
                resolve(next);
              } else if (next.state === "error") {
                stopPolling();
                reject(new Error(next.errors[0] || "The demo could not be prepared."));
              } else if (attempts > 240) {
                stopPolling();
                reject(new Error("This is taking longer than expected. Try again."));
              }
            } catch (err: any) {
              stopPolling();
              reject(err);
            }
          }, 1000);
        });
      } catch (err: any) {
        setError(err.message ?? "Something went wrong.");
        setStatus((prev) => ({ ...prev, state: "error" }));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [signInAsDemoManager, stopPolling],
  );

  const reset = useCallback(async () => {
    await api.post("/demo/reset", {});
    setStatus(EMPTY);
  }, []);

  return { load, reset, busy, error, status, setStatus };
}

/** The best sample to showcase: most findings, preferring mixed reviewers. */
export async function pickShowcaseItem(): Promise<string | null> {
  const items = await api.get<{ id: string; title: string; status: string }[]>("/content");
  if (!items.length) return null;
  const scored: { id: string; score: number }[] = [];
  for (const item of items.slice(0, 24)) {
    try {
      const runs = await api.get<{ id: string; status: string }[]>(`/content/${item.id}/runs`);
      const complete = runs.find((r) => r.status === "complete");
      if (!complete) continue;
      const run = await api.get<{ findings: { reviewer: string }[] }>(`/analysis-runs/${complete.id}`);
      const reviewers = new Set(run.findings.map((f) => f.reviewer));
      scored.push({ id: item.id, score: run.findings.length + reviewers.size * 3 });
    } catch {
      /* keep looking */
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id ?? items[0].id;
}
