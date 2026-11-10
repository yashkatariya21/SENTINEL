"use client";
import { useState } from "react";
import type { Finding } from "@/lib/api";
import { REVIEWERS } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import { ReviewerAvatar } from "./brand/ReviewerAvatar";
import { characterFor } from "./brand/characters";
import { Ribbon } from "./brand/Seal";
import {
  Button, ConfidenceChip, Field, LabelChip, Modal, SeverityChip, TextArea, useToast,
} from "./ui";

interface Props {
  finding: Finding;
  index: number;
  canDecide: boolean;
  active: boolean;
  onActivate: () => void;
  onDecision: (finding: Finding, action: "accept" | "edit" | "dismiss" | "escalate",
               payload: { reason?: string; edited_suggestion?: string }) => Promise<void>;
  onApplySuggestion?: (finding: Finding) => void;
  isApplied?: boolean;
}

export function FindingCard({
  finding, index, canDecide, active, onActivate, onDecision, onApplySuggestion, isApplied,
}: Props) {
  const { showCharacters } = usePrefs();
  const { push } = useToast();
  const [mode, setMode] = useState<null | "edit" | "dismiss" | "escalate" | "citation">(null);
  const [reason, setReason] = useState("");
  const [edited, setEdited] = useState(finding.suggestion || "");
  const [busy, setBusy] = useState(false);

  const reviewer = REVIEWERS[finding.reviewer] || { label: finding.reviewer, job: "" };
  const character = characterFor(finding.reviewer);
  const decided = finding.decision_status !== "open";
  const mood = decided
    ? finding.decision_status === "accepted" || finding.decision_status === "edited" ? "approving" : "idle"
    : "flagging";

  async function submit() {
    if (!mode || mode === "citation") return;
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
      className={`scroll-mt-24 rounded-lg border p-3.5 transition duration-200 ease-royal ${
        active
          ? "border-gold bg-white shadow-card ring-2 ring-gold/30"
          : "border-ink/12 bg-white/85 hover:border-gold/50"
      } ${decided ? "opacity-90" : ""}`}
    >
      {/* ------------------------------------------------ header with character */}
      <div className="flex items-start gap-2.5">
        {showCharacters && <ReviewerAvatar reviewer={finding.reviewer} mood={mood} size={40} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">
              #{index + 1} · {reviewer.label}
            </span>
            <SeverityChip severity={finding.severity} />
            <LabelChip label={finding.label} />
          </div>
          {showCharacters && (
            <p className="mt-1 text-2xs italic text-gold-deep">
              “{character.catchphrase}” — {character.name}
            </p>
          )}
        </div>
      </div>

      {/* issue, in the character's voice then formally */}
      <h3 id={`finding-title-${finding.id}`} className="mt-2 font-display text-sm font-semibold leading-snug text-navy">
        {finding.issue}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ConfidenceChip band={finding.confidence_band} value={finding.confidence} />
        {finding.human_review_required && (
          <Ribbon tone="gold"><span aria-hidden>⚑</span> Human review required</Ribbon>
        )}
        {finding.deterministic && <Ribbon tone="muted">deterministic check</Ribbon>}
      </div>

      {/* ------------------------------------------------- the four sections */}
      <dl className="mt-3 space-y-2.5 text-xs">
        <div>
          <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">Why</dt>
          <dd className="mt-1 leading-relaxed text-ink-soft">
            {finding.why}
            {finding.rule_quote && (
              <blockquote className="mt-2 border-l-2 border-gold bg-ivory-deep/70 px-2.5 py-2">
                <p className="italic leading-relaxed">“{finding.rule_quote}”</p>
                <p className="mt-1 font-mono text-2xs uppercase tracking-wide text-gold-deep">
                  {finding.rule_key ?? "term list"} · rule v{finding.rule_version ?? 1}
                  {finding.evidence?.section ? ` · ${finding.evidence.section}` : ""}
                </p>
              </blockquote>
            )}
          </dd>
        </div>

        <div>
          <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">Impact</dt>
          <dd className="mt-1 leading-relaxed text-ink-soft">{finding.impact}</dd>
        </div>

        <div>
          <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">Suggestion</dt>
          <dd className="mt-1">
            {finding.suggestion ? (
              <div className="rounded-md border border-ink/12 bg-ivory-deep/60 p-2">
                <p className="text-ink-mute">
                  Flagged: <span className="rounded bg-critical-tint px-1 text-critical">{finding.span_text}</span>
                </p>
                <p className="mt-1 text-ink">
                  Becomes: <span className="rounded bg-confirmed-tint px-1 text-confirmed">{finding.suggestion}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {onApplySuggestion && !decided && (
                    <Button
                      size="sm"
                      variant={isApplied ? "secondary" : "primary"}
                      onClick={() => {
                        onApplySuggestion(finding);
                        push(isApplied ? "Change reverted." : "Suggestion applied to the draft preview.", "ok");
                      }}
                    >
                      {isApplied ? "Undo" : "Apply suggestion"}
                    </Button>
                  )}
                  <span className="text-2xs text-ink-mute">Only the flagged span changes.</span>
                </div>
              </div>
            ) : (
              <span className="text-ink-mute">No suggestion offered — a human must decide the rewording.</span>
            )}
          </dd>
        </div>
      </dl>

      {/* ------------------------------------------------------ the citation */}
      <button
        type="button"
        onClick={() => setMode("citation")}
        className="mt-3 flex w-full items-center justify-between gap-2 rounded-md border border-ink/12 bg-ivory-deep/50 px-2.5 py-2 text-left transition hover:border-gold/60 focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span className="min-w-0">
          <span className="block font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">Citation</span>
          <span className="block truncate text-xs text-ink-soft">
            {finding.evidence
              ? `${finding.evidence.document}${finding.evidence.page ? `, p.${finding.evidence.page}` : ""}`
              : "No approved source found"}
          </span>
        </span>
        <span aria-hidden className="font-mono text-2xs text-gold-deep">
          {finding.evidence ? "open ⧉" : "—"}
        </span>
      </button>

      {/* -------------------------------------------------------- decisions */}
      <div className="mt-3 border-t border-ink/10 pt-2.5">
        {decided ? (
          <Ribbon tone={finding.decision_status === "escalated" ? "gold" : "muted"}>
            Decision recorded: {finding.decision_status}
          </Ribbon>
        ) : canDecide ? (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="primary" onClick={() => onDecision(finding, "accept", {})}>Accept</Button>
            <Button size="sm" onClick={() => { setEdited(finding.suggestion || ""); setMode("edit"); }}>Edit</Button>
            <Button size="sm" onClick={() => setMode("dismiss")}>Dismiss…</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("escalate")}>Escalate…</Button>
          </div>
        ) : (
          <p className="text-2xs text-ink-mute">Read-only: a manager, approver or admin records the decision.</p>
        )}
        <p className="mt-2 font-mono text-2xs text-ink-mute">
          {finding.provider} · {finding.model} · prompt {finding.prompt_version} · agreement{" "}
          {Math.round(finding.agreement * 100)}%
          {finding.metrics?.deterministic
            ? " · deterministic check, no model call"
            : finding.metrics?.latency_ms
              ? ` · ${Math.round(finding.metrics.latency_ms)} ms`
              : ""}
          {finding.metrics?.prompt_tokens
            ? ` · ${finding.metrics.prompt_tokens}+${finding.metrics.completion_tokens ?? 0} tokens`
            : ""}
          {typeof finding.metrics?.cost_usd === "number" && finding.metrics.cost_usd > 0
            ? ` · ~$${finding.metrics.cost_usd.toFixed(5)}`
            : ""}
        </p>
      </div>

      {/* ------------------------------------------------------------ modals */}
      <Modal
        open={mode === "citation"}
        onClose={() => setMode(null)}
        title="Citation and evidence"
        footer={<Button onClick={() => setMode(null)}>Close</Button>}
      >
        <div className="space-y-3 text-xs">
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">Rule</p>
            <p className="mt-1 text-ink">
              {finding.rule_key ? `${finding.rule_key} · version ${finding.rule_version ?? 1}` : "No rule key on this check"}
            </p>
            {finding.rule_quote && <p className="mt-1 italic leading-relaxed text-ink-soft">“{finding.rule_quote}”</p>}
          </div>
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">Source chunk</p>
            {finding.evidence ? (
              <div className="mt-1 rounded-md border border-gold/40 bg-ivory p-2.5">
                <p className="text-ink-soft">
                  {finding.evidence.document}
                  {finding.evidence.page ? `, page ${finding.evidence.page}` : ""}
                  {finding.evidence.section ? ` · ${finding.evidence.section}` : ""}
                </p>
                {finding.evidence.snippet && (
                  <p className="mt-1.5 border-l-2 border-gold pl-2 italic leading-relaxed text-ink">
                    “{finding.evidence.snippet}”
                  </p>
                )}
                <p className="mt-1.5 font-mono text-2xs text-ink-mute">
                  chunk {finding.evidence.chunk_id?.slice(0, 8) ?? "—"}
                  {typeof finding.evidence.score === "number" ? ` · relevance ${finding.evidence.score.toFixed(2)}` : ""}
                </p>
              </div>
            ) : (
              <p className="mt-1 rounded-md border border-dashed border-possible/60 bg-possible-tint p-2.5 font-semibold text-possible">
                No approved source found — Sentinel will not invent one.
              </p>
            )}
          </div>
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">How this was produced</p>
            <p className="mt-1 leading-relaxed text-ink-soft">
              Reviewer <strong>{reviewer.label}</strong> ({reviewer.job}). Provider{" "}
              <span className="font-mono">{finding.provider}</span>, model{" "}
              <span className="font-mono">{finding.model}</span>, prompt{" "}
              <span className="font-mono">{finding.prompt_version}</span>.
              {finding.deterministic
                ? " The finding is backed by a deterministic rule check, so the model could not downgrade it."
                : " Confidence blends agreement across repeated runs, evidence strength and deterministic backing."}
            </p>
          </div>
        </div>
      </Modal>

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
            <Button variant="primary" onClick={submit} loading={busy} disabled={!reason.trim()}>
              Dismiss with reason
            </Button>
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
