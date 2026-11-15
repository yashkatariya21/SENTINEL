"use client";
/**
 * The manuscript: the draft, marked up, with its margin notes down the right.
 *
 * A mark is a highlighter fill and a red pen strike with a numbered pin. The note sits
 * in the margin at the same number, repeating the rule, the source and the three things
 * a person can do. Marks and notes are two ends of one link — pressing either brings the
 * other into view.
 *
 * Resolution is visible: an accepted note turns its pin into a green check and its phrase
 * loses the alarm while keeping its place in the sentence, because the draft is evidence.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Finding } from "@/lib/api";
import { Icon } from "../Icon";

export type DecisionAction = "accept" | "edit" | "dismiss" | "escalate";

const DISMISS_REASONS = [
  { value: "not_applicable", label: "Not applicable here" },
  { value: "intended_meaning", label: "The intended meaning is correct" },
  { value: "rule_unclear", label: "The rule is unclear" },
  { value: "evidence_wrong", label: "The evidence is wrong" },
  { value: "other", label: "Other — explain below" },
] as const;

/** Sentence-case severity, shown as a word beside its glyph. */
const SEVERITY_WORD: Record<Finding["severity"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function numbered(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => a.span_start - b.span_start || b.span_end - a.span_end);
}

/* ---------------------------------------------------------------------------
   the draft with its marks
   --------------------------------------------------------------------------- */
export function MarkedDraft({
  text,
  findings,
  order,
  activeId,
  onSelect,
  scrollRef,
}: {
  text: string;
  findings: Finding[];
  order: Finding[];
  activeId: string | null;
  onSelect: (id: string) => void;
  scrollRef?: React.Ref<HTMLDivElement>;
}) {
  const numberOf = useMemo(() => {
    const map: Record<string, number> = {};
    order.forEach((f, i) => (map[f.id] = i + 1));
    return map;
  }, [order]);

  const segments = useMemo(() => {
    const spans = findings
      .filter((f) => f.span_end > f.span_start)
      .map((f) => ({ start: f.span_start, end: f.span_end, finding: f }))
      .sort((a, b) => a.start - b.start || b.end - a.end);
    const cuts = new Set<number>([0, text.length]);
    spans.forEach((s) => {
      cuts.add(Math.max(0, Math.min(text.length, s.start)));
      cuts.add(Math.max(0, Math.min(text.length, s.end)));
    });
    const points = Array.from(cuts).sort((a, b) => a - b);
    const out: { text: string; finding: Finding | null }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      if (end <= start) continue;
      const covering = spans.filter((s) => s.start <= start && s.end >= end);
      // the most severe covering finding wins, so a critical never hides under a low
      const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      const top = [...covering].sort((a, b) => rank[b.finding.severity] - rank[a.finding.severity])[0];
      out.push({ text: text.slice(start, end), finding: top?.finding ?? null });
    }
    return out;
  }, [text, findings]);

  return (
    <div ref={scrollRef} className="draft-body whitespace-pre-wrap break-words" data-testid="content-body">
      {segments.map((seg, i) => {
        if (!seg.finding) return <span key={i}>{seg.text}</span>;
        const f = seg.finding;
        const n = numberOf[f.id];
        const resolved = f.decision_status !== "open";
        const isActive = f.id === activeId;
        return (
          <span key={i} className="relative whitespace-nowrap">
            <mark
              id={`mark-${f.id}`}
              data-finding={f.id}
              role="button"
              tabIndex={0}
              aria-label={`Note ${n}: ${SEVERITY_WORD[f.severity]}, ${f.category.replace(/_/g, " ")}. ${resolved ? `Decided: ${f.decision_status}.` : "Open."} Jump to the margin note.`}
              aria-pressed={isActive}
              onClick={() => onSelect(f.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(f.id);
                }
              }}
              className={`hl hl-${f.severity} ${resolved ? "hl-resolved" : ""} ${isActive ? "hl-active" : ""}`}
            >
              {seg.text}
              <span
                aria-hidden="true"
                className={`mark-pin ${resolved ? "mark-pin-resolved" : ""}`}
                data-testid={`pin-${n}`}
              >
                {resolved ? "✓" : n}
              </span>
            </mark>
          </span>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   the note in the margin
   --------------------------------------------------------------------------- */
export function MarginNote({
  finding,
  number,
  active,
  onFocusNote,
  onDecision,
  busy,
}: {
  finding: Finding;
  number: number;
  active: boolean;
  onFocusNote: (id: string) => void;
  onDecision: (f: Finding, action: DecisionAction, payload: { reason?: string; edited_suggestion?: string }) => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "dismiss">("idle");
  const [draft, setDraft] = useState(finding.suggestion ?? "");
  const [reason, setReason] = useState<string>("not_applicable");
  const [why, setWhy] = useState("");
  const noteRef = useRef<HTMLElement | null>(null);

  const decided = finding.decision_status !== "open";
  const source =
    finding.evidence?.document
      ? `${finding.evidence.document}${finding.evidence.page ? `, p.${finding.evidence.page}` : ""}`
      : "no approved source found";

  const close = useCallback(() => {
    setMode("idle");
    setWhy("");
  }, []);

  /* Escape closes the picker from anywhere — the user should not have to find the
     panel and click back inside it first. */
  useEffect(() => {
    if (mode === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, close]);

  return (
    <article
      id={`note-${finding.id}`}
      ref={noteRef}
      aria-labelledby={`note-title-${finding.id}`}
      onFocus={() => onFocusNote(finding.id)}
      /* a decided note recedes by its ground, never by its ink: dimming the whole
         card with opacity-80 dropped the body text to 3.7:1, and the reading is
         the point — the green ✓ pin and the "decided" line already say the state. */
      className={`rounded-[8px] border-[1.5px] p-3 transition-colors duration-200 ${
        active ? "border-[color:var(--mark)]" : "border-[color:var(--hairline)]"
      } ${decided ? "bg-[color:var(--paper-2)]" : "bg-[color:var(--paper)]"}`}
    >
      {/* number, severity, label */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`inline-grid h-[18px] w-[18px] place-items-center rounded-full font-mono text-[10px] font-semibold ${
              decided ? "bg-[color:var(--pass)] text-[color:var(--paper)]" : "bg-[color:var(--mark)] text-[color:var(--paper)]"
            }`}
          >
            {decided ? "✓" : number}
          </span>
          <h2 id={`note-title-${finding.id}`} className="text-[13px] font-semibold leading-tight text-[color:var(--ink)]">
            {finding.category.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-[color:var(--hairline)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-2)]">
            {SEVERITY_WORD[finding.severity]}
          </span>
          <span className="rounded-full border border-[color:var(--hairline)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-2)]">
            {finding.label === "confirmed" ? "Confirmed" : "Possible"}
          </span>
        </div>
      </div>

      {/* one line of rule + source, per the desk: the quote is the reason */}
      <p className="mt-1.5 text-[11px] leading-[1.5] text-[color:var(--ink-2)]">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink)]">
          {finding.rule_key ? `${finding.rule_key} v${finding.rule_version ?? 1}` : "Rule"}
        </span>{" "}
        · {finding.why.length > 180 ? `${finding.why.slice(0, 177)}…` : finding.why}
      </p>
      <p className="mt-1 text-[11px] leading-[1.5] text-[color:var(--ink-3)]">
        Source: {source}
        {finding.human_review_required && " · needs a human"}
      </p>

      {finding.suggestion && (
        <p className="mt-1.5 rounded border border-[color:var(--hairline)] bg-[color:var(--paper-2)] px-1.5 py-1 text-[11px] text-[color:var(--ink-2)]">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">Suggests </span>
          {finding.suggestion}
        </p>
      )}

      {/* decided: say who and how, in words */}
      {decided && (
        <p className="mt-2 border-t border-[color:var(--hairline)] pt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
          {finding.decision_status === "dismissed"
            ? "Dismissed"
            : finding.decision_status === "escalated"
              ? "Escalated to a manager"
              : finding.decision_status === "edited"
                ? "Edited, then accepted"
                : "Accepted"}{" "}
          by you
        </p>
      )}

      {!decided && mode === "idle" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecision(finding, "accept", {})}
            className="rounded-[4px] bg-[color:var(--ink)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--paper)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("edit")}
            className="rounded-md border-[1.5px] border-[color:var(--ink)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink)] hover:bg-[color:var(--paper-2)] disabled:opacity-50"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("dismiss")}
            className="rounded-md border-[1.5px] border-[color:var(--hairline)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-2)] hover:border-[color:var(--ink)] disabled:opacity-50"
          >
            Dismiss
          </button>
          {finding.human_review_required && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecision(finding, "escalate", { reason: "Sent to a manager for a second read." })}
              className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-3)] underline-offset-2 hover:text-[color:var(--ink)] hover:underline disabled:opacity-50"
            >
              Escalate
            </button>
          )}
        </div>
      )}

      {/* edit: propose different words, never silently rewrite */}
      {mode === "edit" && (
        <div className="mt-2 rounded-md border-[1.5px] border-[color:var(--ink)] bg-[color:var(--paper-2)] p-2">
          <label htmlFor={`edit-${finding.id}`} className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
            Your wording
          </label>
          <textarea
            id={`edit-${finding.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="mt-1 w-full resize-y rounded border border-[color:var(--hairline)] bg-ivory px-1.5 py-1 text-[11px] text-[color:var(--ink)] outline-none focus-visible:border-ink"
          />
          <div className="mt-1 flex gap-1.5">
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => {
                onDecision(finding, "edit", { edited_suggestion: draft });
                close();
              }}
              className="rounded-[4px] bg-[color:var(--ink)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--paper)] disabled:opacity-50"
            >
              Save wording
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-3)] hover:text-ink"
            >
              Cancel
            </button>
          </div>
          <p className="mt-1 text-[10px] text-[color:var(--ink-3)]">Saving records a decision. It does not change the file.</p>
        </div>
      )}

      {/* dismiss: a reason first, because an override is a claim */}
      {mode === "dismiss" && (
        <div
          data-testid="dismiss-picker"
          className="mt-2 rounded-[7px] border-[1.5px] border-[color:var(--mark)] bg-[color:var(--mark-tint)] p-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <fieldset>
            <legend className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--mark-text)]">
              Why is this not a finding?
            </legend>
            <div className="mt-1 space-y-0.5">
              {DISMISS_REASONS.map((r) => (
                <label key={r.value} className="flex items-start gap-1.5 text-[11px] leading-tight text-[color:var(--ink)]">
                  <input
                    type="radio"
                    name={`reason-${finding.id}`}
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-[2px] accent-[var(--mark)]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>
          {reason === "other" && (
            <input
              type="text"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="One short sentence"
              className="mt-1 w-full rounded border border-mark/50 bg-ivory px-1.5 py-1 text-[11px] text-[color:var(--ink)]"
              aria-label="Reason"
            />
          )}
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              disabled={busy || (reason === "other" && !why.trim())}
              onClick={() => {
                const label = DISMISS_REASONS.find((r) => r.value === reason)?.label ?? reason;
                onDecision(finding, "dismiss", {
                  reason: reason === "other" ? why : `${label}.`,
                });
                close();
              }}
              className="rounded-md bg-[color:var(--mark)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--paper)] disabled:opacity-50"
            >
              Record dismissal
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-2)] hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export { numbered };
