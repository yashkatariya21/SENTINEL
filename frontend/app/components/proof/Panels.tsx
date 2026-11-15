"use client";
/**
 * The right column of the proof desk: the verdict, the six reviewers, the paper trail.
 *
 * The verdict is the honest state of the gate. It does not round "two open notes" up to
 * "nearly done": until every note has a decision, Approve is disabled and says why.
 */
import Link from "next/link";
import type { AnalysisRun, Finding } from "@/lib/api";
import { Icon } from "../Icon";
import { Stamp, type StampState } from "../Desk";

export interface Verdict {
  state: StampState;
  open: number;
  decided: number;
  total: number;
  explanation: string;
  canApprove: boolean;
  blockedReason: string | null;
}

/** The gate rules, in one place, so the stamp and the buttons cannot disagree. */
export function verdictFor({
  findings,
  status,
  canApprove,
  isOwner,
  running,
}: {
  findings: Finding[];
  status?: string;
  canApprove: boolean;
  isOwner: boolean;
  running: boolean;
}): Verdict {
  const total = findings.length;
  const decided = findings.filter((f) => f.decision_status !== "open").length;
  const open = total - decided;

  if (running) {
    return {
      state: "awaiting",
      open, decided, total,
      explanation: "The six reviewers are reading. Nothing is published while they work.",
      canApprove: false,
      blockedReason: "Wait for the reviewers to finish.",
    };
  }
  if (status === "approved") {
    return {
      state: "approved",
      open, decided, total,
      explanation: "A person approved this version. Sentinel did not publish it — that stayed with you.",
      canApprove: false,
      blockedReason: "This version is already approved.",
    };
  }
  if (status === "changes_requested") {
    return {
      state: "changes",
      open, decided, total,
      explanation: "Changes were requested. The creator can revise and resubmit; nothing was published.",
      canApprove: canApprove && open === 0,
      blockedReason: null,
    };
  }
  if (total === 0) {
    return {
      state: "ready",
      open, decided, total,
      explanation: "No findings on this version. A person still decides what happens next.",
      canApprove,
      blockedReason: isOwner ? "You own this item, so you cannot approve it yourself." : null,
    };
  }
  if (open > 0) {
    return {
      state: "hold",
      open, decided, total,
      explanation: `Held for a human decision. ${open} note${open === 1 ? "" : "s"} still open. Nothing is published.`,
      canApprove: false,
      blockedReason: `Decide ${open === 1 ? "the remaining note" : `all ${open} remaining notes`} first. The gate stays closed until then.`,
    };
  }
  return {
    state: "ready",
    open, decided, total,
    explanation: "Every note is decided. The gate opens when you approve.",
    canApprove: canApprove && !isOwner,
    blockedReason: isOwner ? "You own this item, so you cannot approve it yourself." : null,
  };
}

/* ---------------------------------------------------------------- verdict card */
export function VerdictCard({
  verdict,
  onApprove,
  onRequestChanges,
  busy,
}: {
  verdict: Verdict;
  onApprove: () => void;
  onRequestChanges: () => void;
  busy: boolean;
}) {
  return (
    <section aria-labelledby="verdict-title" className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="verdict-title" className="eyebrow">
            Verdict
          </h2>
          <p
            data-testid="open-count"
            className="mt-1 font-mono text-[3.25rem] font-semibold leading-none tabular-nums text-[color:var(--ink)]"
          >
            {verdict.open}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
            open {verdict.open === 1 ? "note" : "notes"} · {verdict.decided}/{verdict.total} decided
          </p>
        </div>
        <Stamp state={verdict.state} large drop />
      </div>

      <p className="mt-3 border-t-[1.5px] border-[color:var(--hairline)] pt-2 text-[13px] leading-[1.5] text-[color:var(--ink-2)]">
        {verdict.explanation}
      </p>

      {verdict.blockedReason && (
        <p className="mt-2 rounded-[7px] bg-[color:var(--highlight)] px-2 py-1.5 text-[11px] font-medium leading-tight text-[#111318]">
          {verdict.blockedReason}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onRequestChanges}
          disabled={busy}
          className="min-h-[40px] rounded-[7px] bg-[color:var(--ink)] px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--paper)] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Request changes
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={!verdict.canApprove || busy}
          aria-describedby={!verdict.canApprove ? "approve-why" : undefined}
          className={`min-h-[40px] rounded-[7px] border-[1.5px] px-3 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
            verdict.canApprove
              ? "border-[color:var(--ink)] text-[color:var(--ink)] hover:bg-ink hover:text-[color:var(--paper)]"
              : "cursor-not-allowed border-[color:var(--hairline)] text-[color:var(--ink)]-faint"
          }`}
        >
          Approve
        </button>
        {!verdict.canApprove && (
          <p id="approve-why" className="text-[11px] leading-tight text-[color:var(--ink-3)]">
            {verdict.blockedReason ?? "Only a manager or the approver can approve."}
          </p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- reviewer checks */
const REVIEWER_ORDER: { key: string; label: string }[] = [
  { key: "brand_voice", label: "Brand Voice" },
  { key: "terminology", label: "Terminology" },
  { key: "fact_checker", label: "Fact Checker" },
  { key: "visual", label: "Visual" },
  { key: "accessibility", label: "Accessibility" },
  { key: "legal", label: "Legal" },
];

export function ReviewerChecks({ run }: { run: AnalysisRun | null }) {
  const findings = run?.findings ?? [];
  const done = run?.status === "complete";
  const rows = REVIEWER_ORDER.map((r) => {
    const mine = findings.filter((f) => f.reviewer === r.key);
    const open = mine.filter((f) => f.decision_status === "open").length;
    return { ...r, count: mine.length, open, state: mine.length === 0 ? ("pass" as const) : open > 0 ? ("alert" as const) : ("pass" as const) };
  });
  const finished = done ? REVIEWER_ORDER.length : 0;

  return (
    <section aria-labelledby="reviewers-title" className="panel p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="reviewers-title" className="eyebrow">
          Six reviewers
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-3)]">
          {finished} of 6 done
        </span>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-1.5">
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                r.state === "pass" ? "bg-pass-tint text-[color:var(--pass)]" : "bg-[color:var(--mark)]-tint text-[color:var(--mark-text)]"
              }`}
            >
              <Icon name={r.state === "pass" ? "check" : "alert"} size={11} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-[color:var(--ink-2)]">{r.label}</span>
            <span className="font-mono text-[10px] tabular-nums text-[color:var(--ink-3)]">{r.count || "—"}</span>
            <span className="sr-only">
              {r.state === "pass" ? "passed" : `${r.open} open findings`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 border-t border-[color:var(--hairline)] pt-2 text-[11px] leading-tight text-[color:var(--ink-3)]">
        {done
          ? "All six finished. Every note below is attributed to the reviewer who raised it."
          : run
            ? "Reading the draft against the Brand Kit…"
            : "No review has run on this version yet."}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ paper trail */
export function PaperTrail({
  findings,
  item,
  run,
  canReadAudit,
}: {
  findings: Finding[];
  item: { submitted_at: string | null; current_version: number; status: string } | null;
  run: AnalysisRun | null;
  canReadAudit: boolean;
}) {
  const decided = findings.filter((f) => f.decision_status !== "open");
  const entries: { at: string | null; who: string; what: string; system: boolean }[] = [];

  if (item?.submitted_at) {
    entries.push({ at: item.submitted_at, who: "Creator", what: `Draft v${item.current_version} submitted for review`, system: true });
  }
  if (run?.status === "complete") {
    entries.push({
      at: null,
      who: "Sentinel",
      what: `${findings.length} finding${findings.length === 1 ? "" : "s"} recorded by six reviewers`,
      system: true,
    });
  }
  decided.forEach((f) =>
    entries.push({
      at: null,
      who: "You",
      what: `${f.decision_status === "dismissed" ? "Dismissed" : f.decision_status === "escalated" ? "Escalated" : "Accepted"} “${f.span_text.slice(0, 40)}${f.span_text.length > 40 ? "…" : ""}”`,
      system: false,
    }),
  );

  return (
    <section aria-labelledby="trail-title" className="mt-3 panel p-3">
      <div className="flex items-baseline justify-between">
        <h2 id="trail-title" className="eyebrow">
          Paper trail
        </h2>
        {canReadAudit && (
          <Link href="/audit" className="link-under font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-2)]">
            Full audit log
          </Link>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-[color:var(--ink-3)]">Nothing has happened to this draft yet.</p>
      ) : (
        <ol className="mt-1.5 divide-y divide-ink/10">
          {entries.map((e, i) => (
            <li key={i} className="flex items-baseline gap-2 py-1 text-[11px]">
              <span className={`font-mono text-[9px] uppercase tracking-[0.1em] ${e.system ? "text-[color:var(--ink-3)]" : "text-[color:var(--mark-text)]"}`}>
                {e.system ? "System" : "Human"}
              </span>
              <span className="text-[color:var(--ink-2)]">{e.what}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-[color:var(--ink-3)]">
                {e.at ? new Date(e.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "now"}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-1.5 border-t border-[color:var(--hairline)] pt-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
        {item?.status === "approved"
          ? "Nothing was published by Sentinel."
          : "Nothing auto-fixes. Nothing publishes without a person."}
      </p>
    </section>
  );
}
