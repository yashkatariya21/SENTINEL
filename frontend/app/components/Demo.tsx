"use client";
/**
 * One-click demo: button + full-width progress panel + 4-step guided tour.
 * Used on /login, the Overview empty state and the header menu.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { pickShowcaseItem, useDemoLoader, useDemoStatus } from "@/lib/demo";
import { Button, Card } from "./ui";
import { Sentri, type SentriMood } from "./brand/Sentri";
import { ReviewerAvatar } from "./brand/ReviewerAvatar";
import { usePrefs } from "@/lib/prefs";

const TOUR_KEY = "sentinel.tour.done";

/* ------------------------------------------------------------------ button */
export function LoadDemoButton({
  label = "Load demo data",
  variant = "primary",
  size = "md",
  onDone,
  className = "",
}: {
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  onDone?: (itemId: string | null) => void;
  className?: string;
}) {
  const router = useRouter();
  const { refresh } = useAuth();
  const loader = useDemoLoader();
  const [open, setOpen] = useState(false);
  const [tour, setTour] = useState(false);

  const start = useCallback(async () => {
    setOpen(true);
    try {
      await loader.load();
      await refresh();
      const itemId = await pickShowcaseItem();
      if (!itemId) throw new Error("The workspace loaded but has no content to show.");
      setTour(true);
      onDone?.(itemId);
      if (!onDone) router.push(`/content/${itemId}`);
    } catch {
      /* the panel renders the error and offers a retry */
    }
  }, [loader, onDone, refresh, router]);

  return (
    <>
      <Button variant={variant} size={size} loading={loader.busy} onClick={start} className={className}>
        {label}
      </Button>
      {open && (
        <DemoProgressPanel
          status={loader.status}
          error={loader.error}
          busy={loader.busy}
          onRetry={start}
          onClose={() => setOpen(false)}
        />
      )}
      {tour && <DemoTour onClose={() => setTour(false)} />}
    </>
  );
}

/* ---------------------------------------------------------------- progress */
export function DemoProgressPanel({
  status,
  error,
  busy,
  onRetry,
  onClose,
}: {
  status: { state: string; phase: string; total: number; analysed: number; findings: number; errors: string[] };
  error: string | null;
  busy: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const pct = status.total > 0 ? Math.min(100, Math.round((status.analysed / status.total) * 100)) : 6;
  const failed = status.state === "error" || !!error;

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 border-b border-gold/40 bg-navy px-4 py-3 text-ivory shadow-herald sm:px-6"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-base font-semibold tracking-tight">
            {failed ? "That did not finish" : status.state === "done" ? "Northwind is ready" : "Preparing Northwind Analytics"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-ivory/70 underline-offset-4 hover:text-ivory hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            aria-label="Hide progress panel"
          >
            Hide
          </button>
        </div>

        {failed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ivory/85">
              {error || status.errors?.[0] || "The demo could not be prepared. Nothing was changed."}
            </p>
            <Button size="sm" variant="primary" onClick={onRetry} loading={busy}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-ivory/15"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label="Demo progress"
            >
              <div
                className="h-full rounded-full bg-gradient-gold transition-[width] duration-500 ease-royal motion-reduce:transition-none"
                style={{ width: `${Math.max(pct, 4)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-wider text-ivory/70">
              <span>{status.phase || "Reading the Brand Kit"}</span>
              <span>
                {status.analysed}/{status.total || "—"} reviewed · {status.findings} findings
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- tour */
const STEPS = [
  {
    mood: "scanning" as SentriMood,
    title: "Every finding is highlighted in the text",
    body: "The document on the left is untouched. Highlights show exactly where a rule was questioned — nothing is edited for you.",
  },
  {
    mood: "thinking" as SentriMood,
    title: "Open a card and trace the citation",
    body: "Each card names the rule, quotes it, and points at the guideline page that supports the call. If it cannot prove it, it says “No approved source found”.",
  },
  {
    mood: "alert" as SentriMood,
    title: "Override as a Manager, then answer the prompt",
    body: "Dismiss a finding with a reason. Sentinel asks whether to make it an approved rule. Say yes and it becomes a versioned exception — only in the scope you pick.",
  },
  {
    mood: "celebrating" as SentriMood,
    title: "Watch Analytics move",
    body: "The Brand Score, department compliance and the violation trend recompute from real decisions. Nothing here is a mock number.",
  },
];

export function DemoTour({ onClose }: { onClose: () => void }) {
  const { showCharacters } = usePrefs();
  const [step, setStep] = useState(0);
  const router = useRouter();
  const done = step >= STEPS.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && !done) setStep((s) => s + 1);
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, onClose]);

  const finish = () => {
    try {
      window.localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* private mode */
    }
    onClose();
  };

  if (done) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gold/40 bg-navy px-4 py-3 text-ivory shadow-herald">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            That is the loop: <span className="text-gold-soft">review → explain → human decides → the system learns</span>.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-ivory hover:bg-ivory/10" onClick={() => { finish(); router.push("/analytics"); }}>
              See Analytics
            </Button>
            <Button size="sm" variant="primary" onClick={finish}>
              Finish tour
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const current = STEPS[step];
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-6">
      <Card className="mx-auto max-w-3xl border-gold/40 bg-navy text-ivory shadow-herald">
        <div className="flex items-start justify-between gap-4 p-4 sm:p-5">
          {showCharacters && (
            <span className="-mt-1 shrink-0" aria-hidden>
              <Sentri mood={current.mood} size={62} decorative />
            </span>
          )}
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-gold-soft">
              Guided tour · step {step + 1} of {STEPS.length}
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold">{current.title}</h3>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-ivory/80">{current.body}</p>
            {showCharacters && step === 1 && (
              <div className="mt-2 flex items-center gap-1.5">
                {["brand_voice", "terminology", "fact_checker", "visual", "accessibility", "legal"].map((key) => (
                  <ReviewerAvatar key={key} reviewer={key} size={26} />
                ))}
                <span className="ml-1 text-2xs text-ivory/60">the six reviewers, each with their own lens</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={finish}
            className="rounded px-2 py-1 text-xs text-ivory/60 hover:text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Skip
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-ivory/10 px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 w-6 rounded-full ${i <= step ? "bg-gold" : "bg-ivory/20"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-ivory hover:bg-ivory/10"
                    disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
            <Button size="sm" variant="primary" onClick={() => setStep((s) => s + 1)}>
              {step === STEPS.length - 1 ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------- reset */
export function ResetDemoButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [state, setState] = useState<string>("");

  useEffect(() => {
    apiStatus(setState);
  }, []);

  async function reset() {
    if (!window.confirm("Remove all demo content for this workspace? The Brand Kit and rules stay.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const { api } = await import("@/lib/api");
      await api.post("/demo/reset", {});
      setMsg("Demo content cleared.");
      await refresh();
      setState("idle");
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size={size} variant="ghost" onClick={reset} loading={busy} disabled={state === "idle"}>
        Reset demo
      </Button>
      {msg && <span className="text-xs text-ink-mute" role="status">{msg}</span>}
    </div>
  );
}

async function apiStatus(set: (s: string) => void) {
  try {
    const { api } = await import("@/lib/api");
    const status = await api.get<{ state: string }>("/demo/status");
    set(status.state);
  } catch {
    set("");
  }
}
