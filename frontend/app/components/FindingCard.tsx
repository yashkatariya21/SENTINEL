"use client";
import { useState } from "react";
import type { Finding } from "@/lib/api";
import { REVIEWERS } from "@/lib/api";
import {
  Button, ConfidenceChip, Field, LabelChip, Modal, SeverityChip, TextArea, Tag,
} from "./ui";

interface Props {
  finding: Finding;
  index: number;
  canDecide: boolean;
  active: boolean;
  onActivate: () => void;
  onDecision: (finding: Finding, action: "accept" | "edit" | "dismiss" | "escalate",
               payload: { reason?: string; edited_suggestion?: string }) => Promise<void>;
}

export function FindingCard({ finding, index, canDecide, active, onActivate, onDecision }: Props) {
  const [mode, setMode] = useState<null | "edit" | "dismiss" | "escalate">(null);
  const [reason, setReason] = useState("");
  const [edited, setEdited] = useState(finding.suggestion || "");
  const [busy, setBusy] = useState(false);

  const reviewer = REVIEWERS[finding.reviewer] || { label: finding.reviewer, job: "" };
  const decided = finding.decision_status !== "open";

  async function submit() {
    if (!mode) return;
    setBusy(true);
    try {
      await onDecision(finding, mode, mode === "edit" ? { edited_suggestion: edited } : { reason });
      setMode(null);
      setReason("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      id={`finding-${finding.id}`}
      aria-labelledby={`finding-title-${finding.id}`}
      tabIndex={-1}
      onFocus={onActivate}
      className={`scroll-mt-24 rounded-xl border bg-white p-4 transition ${
        active ? "border-navy-500 ring-2 ring-navy-500/20" : "border-ink/10"
      } ${decided ? "opacity-80" : ""}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-mute">
          #{index + 1} · {reviewer.label}
        </span>
        <SeverityChip severity={finding.severity} />
        <LabelChip label={finding.label} />
        <ConfidenceChip band={finding.confidence_band} value={finding.confidence} />
        {finding.human_review_required && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            <span aria-hidden="true">⚑</span> Human review required
          </span>
        )}
        {finding.deterministic && (
          <span className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-paper px-2 py-0.5 text-xs text-ink-soft">
            deterministic check
          </span>
        )}
      </div>

      <h3 id={`finding-title-${finding.id}`} className="text-sm font-semibold text-ink">{finding.issue}</h3>

      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Why</dt>
          <dd className="mt-1 text-ink-soft">{finding.why}</dd>
          {finding.rule_quote ? (
            <blockquote className="mt-2 border-l-2 border-navy-500 bg-navy-50/60 px-3 py-2 text-xs text-ink-soft">
              <p className="italic">“{finding.rule_quote}”</p>
              <p className="mt-1 font-medium text-navy-700">
                {finding.rule_key} · rule v{finding.rule_version}
                {finding.evidence?.section ? ` · ${finding.evidence.section}` : ""}
              </p>
            </blockquote>
          ) : (
            <p className="mt-2 rounded border border-dashed border-ink/20 px-3 py-2 text-xs text-ink-mute">
              No approved source found
            </p>
          )}

          <div className="mt-2 rounded-lg border border-ink/10 bg-paper px-3 py-2 text-xs">
            <p className="font-medium text-ink">Evidence</p>
            {finding.evidence ? (
              <>
                <p className="mt-0.5 text-ink-soft">
                  {finding.evidence.document}
                  {finding.evidence.page ? `, page ${finding.evidence.page}` : ""}
                  {finding.evidence.section ? ` · ${finding.evidence.section}` : ""}
                </p>
                {finding.evidence.snippet && (
                  <p className="mt-1 line-clamp-3 italic text-ink-mute">“{finding.evidence.snippet}”</p>
                )}
              </>
            ) : (
              <p className="mt-0.5 font-medium text-amber-700">No approved source found</p>
            )}
          </div>
        </div>

        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Impact</dt>
          <dd className="mt-1 text-ink-soft">{finding.impact}</dd>
        </div>

        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Suggestion</dt>
          <dd className="mt-1">
            {finding.suggestion ? (
              <div className="rounded-lg border border-ink/10 bg-white p-2 text-xs">
                <p className="text-ink-mute">
                  Flagged span: <span className="rounded bg-danger-50 px-1 text-danger-700">{finding.span_text}</span>
                </p>
                <p className="mt-1 text-ink">
                  Becomes: <span className="rounded bg-ok-50 px-1 text-ok-600">{finding.suggestion}</span>
                </p>
                <p className="mt-1 text-[11px] text-ink-mute">A suggestion may only change the flagged span.</p>
              </div>
            ) : (
              <span className="text-xs text-ink-mute">No suggestion offered — a human must decide the rewording.</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-3">
        {decided ? (
          <Tag tone={finding.decision_status === "escalated" ? "amber" : "neutral"}>
            Decision recorded: {finding.decision_status}
          </Tag>
        ) : canDecide ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => onDecision(finding, "accept", {})}>Accept</Button>
            <Button size="sm" onClick={() => { setEdited(finding.suggestion || ""); setMode("edit"); }}>Edit</Button>
            <Button size="sm" onClick={() => setMode("dismiss")}>Dismiss…</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("escalate")}>Escalate…</Button>
          </div>
        ) : (
          <p className="text-xs text-ink-mute">Read-only: a manager, approver or admin records the decision.</p>
        )}
        <p className="text-[10px] text-ink-mute">
          {finding.provider} · {finding.model} · prompt {finding.prompt_version} · agreement{" "}
          {Math.round(finding.agreement * 100)}%
        </p>
      </div>

      {mode === "edit" && (
        <Modal
          open
          onClose={() => setMode(null)}
          title="Edit the suggestion"
          footer={<>
            <Button onClick={() => setMode(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={busy}>Save decision</Button>
          </>}
        >
          <Field label="Replacement for the flagged span" htmlFor={`edit-${finding.id}`}
                 hint="Only the flagged span can change; the rest of the content is untouched.">
            <TextArea id={`edit-${finding.id}`} value={edited} onChange={(e) => setEdited(e.target.value)} />
          </Field>
          <p className="text-xs text-ink-mute">
            Your edit is recorded as a human decision. If you are overriding the AI, you will be asked whether it
            should become a rule.
          </p>
        </Modal>
      )}

      {mode === "dismiss" && (
        <Modal
          open
          onClose={() => setMode(null)}
          title="Dismiss this finding"
          footer={<>
            <Button onClick={() => setMode(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={busy} disabled={!reason.trim()}>Dismiss with reason</Button>
          </>}
        >
          <Field label="Reason for dismissing" htmlFor={`dismiss-${finding.id}`} required
                 hint="Required. A dismissal is a manager decision and may become a rule.">
            <TextArea id={`dismiss-${finding.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      )}

      {mode === "escalate" && (
        <Modal
          open
          onClose={() => setMode(null)}
          title="Escalate for human review"
          footer={<>
            <Button onClick={() => setMode(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={busy} disabled={!reason.trim()}>Escalate</Button>
          </>}
        >
          <Field label="What should the reviewer check?" htmlFor={`escalate-${finding.id}`} required>
            <TextArea id={`escalate-${finding.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      )}
    </article>
  );
}
