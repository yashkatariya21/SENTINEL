"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, EmptyState, SectionHeading, Skeleton, Tag, useToast } from "../components/ui";
import { Figure } from "../components/Desk";
import { Icon } from "../components/Icon";

interface OverrideRow {
  id: string;
  status: string;
  reason: string | null;
  scope_choice: string | null;
  scope_department: string | null;
  scope_content_type: string | null;
  manager: string;
  created_at: string;
  finding: { id: string; issue: string; severity: string; category: string } | null;
  content: { id: string; title: string } | null;
  proposed_body: string | null;
  rule_key: string | null;
  new_version: number | null;
  approval_required_from: string | null;
  regression: any;
}

const STATUS_COPY: Record<string, { label: string; tone: "neutral" | "navy" | "amber" }> = {
  awaiting_answer: { label: "Waiting for the learning prompt", tone: "amber" },
  declined: { label: "Declined — no rule created", tone: "neutral" },
  pending_approval: { label: "Waiting for an Approver", tone: "amber" },
  promoted: { label: "Rule version created", tone: "navy" },
  rejected: { label: "Rejected", tone: "neutral" },
};

/**
 * Adaptive learning — a docket of overrides. Each row is one proposal with its
 * reason quoted verbatim in the margin, the scope it was granted, and the
 * regression run that followed the promotion.
 */
export default function LearningPage() {
  const { can, me } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<OverrideRow[] | null>(null);
  const [regressions, setRegressions] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    setRows(await api.get<OverrideRow[]>("/overrides"));
    if (can("can_read_analytics")) {
      setRegressions(await api.get<any[]>("/regressions").catch(() => []));
    }
  }, [can]);

  useEffect(() => { load().catch((e) => push(e.message, "error")); }, [load, push]);

  async function promote(row: OverrideRow) {
    try {
      await api.post(`/overrides/${row.id}/promote`, { approver_note: "Confirmed by the Approver." });
      push("Promoted: a new rule version now drives future reviews.", "ok");
      await load();
    } catch (err: any) {
      push(err.message, "error");
    }
  }

  return (
    <div>
      <SectionHeading
        title="Adaptive learning" as="h1"
        subtitle="Every manager override is a proposal, never a silent change. The system asks “Make this an approved rule?” and records the answer, the scope and the reason."
      />

      <div className="mb-5 grid grid-cols-3 divide-[color:var(--hairline)] border-y border-[color:var(--hairline)] bg-[color:var(--paper)] sm:divide-x">
        <Figure value={String(rows?.length ?? 0)} label="Overrides recorded" sub="proposals, not changes" />
        <Figure value={String(rows?.filter((r) => r.status === "pending_approval").length ?? 0)} label="Waiting for an Approver" sub="scope-limited" />
        <Figure value={String(rows?.filter((r) => r.status === "promoted").length ?? 0)} label="Rules created" sub="versioned, reversible" />
      </div>

      {!rows && <Skeleton className="h-40 w-full" />}
      {rows && rows.length === 0 && (
        <EmptyState title="No overrides yet"
                    body="When a manager dismisses or edits an AI suggestion, the learning prompt appears here." />
      )}

      <ol className="border-t-[1.5px] border-[color:var(--hairline-strong)]">
        {(rows || []).map((row, idx) => {
          const status = STATUS_COPY[row.status] || { label: row.status, tone: "neutral" as const };
          const canPromote = row.status === "pending_approval" && ["approver", "admin", "brand_manager"].includes(me?.user.role || "");
          const awaiting = row.status === "pending_approval";
          return (
            <li
              key={row.id}
              className={`relative border-b border-[color:var(--hairline)] pl-3 pr-1 py-4 transition-colors hover:bg-[color:var(--paper-2)] ${
                awaiting ? "border-l-[3px] border-l-[color:var(--warn)] pl-4" : "border-l-[3px] border-l-transparent"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-hidden="true" className="font-mono text-[11px] tabular-nums text-[color:var(--ink-3)]">
                      {String(idx + 1).padStart(3, "0")}
                    </span>
                    <Tag tone={status.tone}>{status.label}</Tag>
                    {row.rule_key && <Tag tone="navy">{row.rule_key}{row.new_version ? ` v${row.new_version}` : ""}</Tag>}
                    {row.finding?.category && <Tag>{row.finding.category}</Tag>}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ink)]">{row.finding?.issue}</p>
                  {row.content && (
                    <p className="mt-0.5 text-xs text-[color:var(--ink-3)]">on “{row.content.title}”</p>
                  )}
                  <blockquote className="mt-2 border-l-2 border-[color:var(--hairline-strong)] pl-2.5 font-doc text-[15px] italic leading-snug text-[color:var(--ink-2)]">
                    “{row.reason}”
                  </blockquote>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
                    Decided by {row.manager} · {new Date(row.created_at).toLocaleDateString()} · scope:{" "}
                    {row.scope_choice === "department" ? `department ${row.scope_department}`
                      : row.scope_choice === "content_type" ? `content type ${row.scope_content_type}`
                      : row.scope_choice === "global" ? "global" : "not answered"}
                  </p>
                  {row.proposed_body && (
                    <p className="prose-measure mt-2 border-l-2 border-[color:var(--mark)] bg-[color:var(--highlight-tint)] px-2.5 py-1.5 font-doc text-[15px] leading-snug text-[color:var(--ink)]">
                      {row.proposed_body}
                    </p>
                  )}
                  {row.regression && !row.regression.error && (
                    <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
                      Regression suite:{" "}
                      {row.regression.passed === false ? (
                        <span className="flex items-center gap-1 font-semibold text-[color:var(--mark-text)]">
                          <Icon name="alert" size={12} /> regressions detected
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-semibold text-[color:var(--pass)]">
                          <Icon name="check" size={12} /> no regressions
                        </span>
                      )}
                      · {row.regression.samples ?? 0} labelled samples
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {row.status === "awaiting_answer" && (
                    <p className="max-w-56 text-right text-[11px] leading-relaxed text-[color:var(--warn)]">
                      Open the review report to answer “Make this an approved rule?”.
                    </p>
                  )}
                  {row.status === "pending_approval" && (
                    <Button size="sm" variant="primary" disabled={!canPromote} onClick={() => promote(row)}>
                      {canPromote ? "Approve rule change" : "Approver only"}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {regressions && regressions.length > 0 && (
        <div className="mt-6">
          <SectionHeading title="Regression runs"
                         subtitle="After every promotion the labelled test set is re-run to catch regressions." />
          <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <caption className="sr-only">Regression runs after rule promotions</caption>
            <thead>
              <tr className="border-y border-[color:var(--hairline)] font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                <th scope="col" className="py-1.5 pr-3 font-medium">When</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Trigger</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Result</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Micro precision</th>
                <th scope="col" className="py-1.5 font-medium">Micro recall</th>
              </tr>
            </thead>
            <tbody>
              {regressions.map((r) => (
                <tr key={r.id} className="border-b border-[color:var(--hairline)] transition-colors hover:bg-[color:var(--highlight-tint)]">
                  <td className="py-2 pr-3 font-mono">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">{r.trigger}</td>
                  <td className="py-2 pr-3">
                    {r.passed ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--pass)]">
                        <Icon name="check" size={12} /> passed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-[color:var(--mark-text)]">
                        <Icon name="alert" size={12} /> regressions
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{r.metrics?.candidate?.overall?.micro_precision}</td>
                  <td className="py-2 font-mono tabular-nums">{r.metrics?.candidate?.overall?.micro_recall}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
