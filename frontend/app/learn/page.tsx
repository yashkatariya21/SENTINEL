"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, EmptyState, SectionHeading, Skeleton, Tag, useToast } from "../components/ui";

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
        title="Adaptive learning"
        subtitle="Every manager override is a proposal, never a silent change. The system asks “Make this an approved rule?” and records the answer, the scope and the reason."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          ["Overrides recorded", rows?.length ?? 0],
          ["Waiting for an Approver", rows?.filter((r) => r.status === "pending_approval").length ?? 0],
          ["Rules created", rows?.filter((r) => r.status === "promoted").length ?? 0],
        ].map(([label, value]) => (
          <Card key={label as string} className="p-4">
            <p className="text-xs uppercase tracking-wide text-ink-mute">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{value as number}</p>
          </Card>
        ))}
      </div>

      {!rows && <Skeleton className="h-40 w-full" />}
      {rows && rows.length === 0 && (
        <EmptyState title="No overrides yet"
                    body="When a manager dismisses or edits an AI suggestion, the learning prompt appears here." />
      )}

      <div className="space-y-2">
        {(rows || []).map((row) => {
          const status = STATUS_COPY[row.status] || { label: row.status, tone: "neutral" as const };
          const canPromote = row.status === "pending_approval" && ["approver", "admin", "brand_manager"].includes(me?.user.role || "");
          return (
            <Card key={row.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone={status.tone}>{status.label}</Tag>
                    {row.rule_key && <Tag tone="navy">{row.rule_key}{row.new_version ? ` v${row.new_version}` : ""}</Tag>}
                    {row.finding?.category && <Tag>{row.finding.category}</Tag>}
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-ink">{row.finding?.issue}</p>
                  {row.content && (
                    <p className="text-xs text-ink-mute">
                      on “{row.content.title}”
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-soft">“{row.reason}”</p>
                  <p className="mt-1 text-[11px] text-ink-mute">
                    Decided by {row.manager} · {new Date(row.created_at).toLocaleDateString()} · scope:{" "}
                    {row.scope_choice === "department" ? `department ${row.scope_department}`
                      : row.scope_choice === "content_type" ? `content type ${row.scope_content_type}`
                      : row.scope_choice === "global" ? "global" : "not answered"}
                  </p>
                  {row.proposed_body && (
                    <p className="mt-1 rounded bg-paper px-2 py-1 text-xs text-ink-soft">{row.proposed_body}</p>
                  )}
                  {row.regression && !row.regression.error && (
                    <p className="mt-1 text-[11px] text-ink-mute">
                      Regression suite: {row.regression.passed === false
                        ? <span className="font-medium text-critical">regressions detected</span>
                        : <span className="font-medium text-confirmed">no regressions</span>}{" "}
                      · {row.regression.samples ?? 0} labelled samples
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {row.status === "awaiting_answer" && (
                    <p className="max-w-56 text-right text-[11px] text-possible">
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
            </Card>
          );
        })}
      </div>

      {regressions && regressions.length > 0 && (
        <Card className="mt-5 p-5">
          <SectionHeading title="Regression runs"
                           subtitle="After every promotion the labelled test set is re-run to catch regressions." />
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-ink-mute">
                <th scope="col" className="py-1 pr-3 font-medium">When</th>
                <th scope="col" className="py-1 pr-3 font-medium">Trigger</th>
                <th scope="col" className="py-1 pr-3 font-medium">Result</th>
                <th scope="col" className="py-1 pr-3 font-medium">Micro precision</th>
                <th scope="col" className="py-1 font-medium">Micro recall</th>
              </tr>
            </thead>
            <tbody>
              {regressions.map((r) => (
                <tr key={r.id} className="border-t border-ink/5">
                  <td className="py-1.5 pr-3">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-1.5 pr-3">{r.trigger}</td>
                  <td className="py-1.5 pr-3">
                    {r.passed ? <span className="text-confirmed">passed</span> : <span className="text-critical">regressions</span>}
                  </td>
                  <td className="py-1.5 pr-3">{r.metrics?.candidate?.overall?.micro_precision}</td>
                  <td className="py-1.5">{r.metrics?.candidate?.overall?.micro_recall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
