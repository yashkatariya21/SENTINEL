"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, AnalysisRun, ContentItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Button, Card, Field, KeyValue, SectionHeading, SeverityChip, Skeleton, StatusPill,
  Tag, TextArea, useToast,
} from "../../../components/ui";
import { GateStrip, Stamp, TabStrip } from "../../../components/Desk";
import { Icon } from "../../../components/Icon";

interface TimelineEvent { at: string; kind: string; version: number; actor: string; detail: string }
interface ApprovalRow { id: string; action: string; actor: string; actor_role: string; version: number; reason: string | null; decided_at: string }
interface CommentRow { id: string; body: string; author: string; author_role: string; visibility: string; version: number; created_at: string }

export default function ApprovalPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { me, can } = useAuth();
  const { push } = useToast();

  const [item, setItem] = useState<ContentItem | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "external">("internal");
  const [tab, setTab] = useState<"content" | "history" | "comments">("content");
  /** The stamp that is pressed when a decision is recorded. Cleared automatically. */
  const [stamp, setStamp] = useState<{ action: string; version: number; by: string } | null>(null);

  useEffect(() => {
    if (!stamp) return;
    const timer = window.setTimeout(() => setStamp(null), 3200);
    return () => window.clearTimeout(timer);
  }, [stamp]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await api.get<ContentItem>(`/content/${id}`);
    setItem(data);
    const [v, t, a, c] = await Promise.all([
      api.get<any[]>(`/content/${id}/versions`),
      api.get<{ events: TimelineEvent[] }>(`/content/${id}/timeline`),
      api.get<ApprovalRow[]>(`/content/${id}/approvals`),
      api.get<CommentRow[]>(`/content/${id}/comments`),
    ]);
    setVersions(v); setTimeline(t.events); setApprovals(a); setComments(c);
    if (data.active_run_id) {
      const r = await api.get<AnalysisRun>(`/analysis-runs/${data.active_run_id}`);
      setRun(r);
    }
  }, [id]);

  useEffect(() => { load().catch((e) => push(e.message, "error")); }, [load, push]);

  const isOwner = item?.owner_id === me?.user.id;
  const canApprove = can("can_approve");
  const blocking = isOwner;
  const openHigh = (run?.findings || []).filter((f) => ["high", "critical"].includes(f.severity) && f.decision_status === "open");

  async function act(action: "approve" | "reject" | "request_changes") {
    setBusy(true);
    try {
      await api.post(`/content/${id}/approve`, { action, reason: reason || undefined });
      push(
        action === "approve" ? "Approved. Sentinel did not publish it — that stays with your publishing tool."
          : action === "reject" ? "Rejected with a recorded reason."
          : "Changes requested.",
        "ok");
      setReason("");
      if (action === "approve" || action === "reject") {
        setStamp({
          action,
          version: item?.current_version ?? 0,
          by: me?.user.name ?? "a reviewer",
        });
      }
      await load();
    } catch (err: any) {
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    setBusy(true);
    try {
      await api.post(`/content/${id}/submit`, { body: "Ready for approval.", visibility: "internal" });
      push("Submitted for approval.", "ok");
      await load();
    } catch (err: any) {
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/content/${id}/comments`, { body: comment, visibility });
      setComment("");
      await load();
    } catch (err: any) {
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!item) return <Skeleton className="h-64 w-full" />;
  const gateStep = item.status === "approved" || item.status === "rejected" ? 3 : item.status === "in_review" ? 2 : 1;

  return (
    <div>
      {/* the stamp that lands when a decision is recorded — same rule as everywhere:
          the word is the message, the ink is the emphasis */}
      {stamp && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-[#111318]/60 p-6"
          role="status"
          aria-live="assertive"
          onClick={() => setStamp(null)}
        >
          <div className="animate-[modal-rise_320ms_cubic-bezier(0.16,1,0.3,1)_both] rounded-[12px] border-[1.5px] border-[#111318] bg-[color:var(--paper)] px-10 py-8 text-center">
            <Stamp state={stamp.action === "approve" ? "approved" : "changes"} large drop />
            <p className="mt-6 text-lg font-semibold text-[color:var(--ink)]">
              {stamp.action === "approve" ? "Approved" : "Rejected"} · version {stamp.version}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-3)]">
              {stamp.by} · recorded in the audit log
            </p>
            <p className="mx-auto mt-3 max-w-xs text-[11px] leading-relaxed text-[color:var(--ink-2)]">
              Sentinel did not publish anything. That stays with your publishing tool.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- head */}
      <div className="mb-4 border-b-[1.5px] border-[color:var(--hairline-strong)] pb-4">
        <nav className="mb-1.5 flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]" aria-label="Breadcrumb">
          <Link href="/content" className="hover:text-[color:var(--ink)]">Content queue</Link>
          <span aria-hidden="true">/</span>
          <span className="text-[color:var(--ink)]">Approval</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[1.7rem] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">{item.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill status={item.status} />
              <Tag>{item.content_type.replace("_", " ")}</Tag>
              <Tag>{item.department || "No department"}</Tag>
              <Tag>Owner: {item.owner_name}</Tag>
              <Tag>v{item.current_version}</Tag>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/content/${id}`}><Button>Review report</Button></Link>
            {(item.status === "draft" || item.status === "changes_requested") && (isOwner || can("can_approve")) && (
              <Button variant="primary" onClick={submitForReview} loading={busy}>Submit for approval</Button>
            )}
          </div>
        </div>
      </div>

      <GateStrip current={gateStep} released={item.status === "approved"} className="mb-5 rounded-[8px]" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <div className="min-w-0">
          <div className="desk-sheet mb-4 rounded-[10px] border-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper)]">
            <TabStrip
              className="border-t-0 px-2"
              label="Approval detail"
              value={tab}
              onChange={(key) => setTab(key as typeof tab)}
              tabs={[
                { key: "content", label: "Content" },
                { key: "history", label: "Version history", count: versions.length },
                { key: "comments", label: "Comments", count: comments.length },
              ]}
            />

            <div className="p-4 sm:p-5">
              {tab === "content" && (
                <>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
                      Version {item.current_version}
                    </p>
                    <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
                      Submitted {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "not yet submitted"}
                    </p>
                  </div>
                  <div className="draft-body max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-[6px] border border-[color:var(--hairline)] bg-[color:var(--paper-2)] p-4">
                    {item.version?.body_text}
                  </div>

                  {run && (
                    <div className="mt-5">
                      <SectionHeading title="Latest review" subtitle="Recorded with provider, model and prompt version" />
                      <dl className="grid grid-cols-2 gap-3 border-y border-[color:var(--hairline)] py-3 sm:grid-cols-4">
                        <KeyValue label="Findings">{run.findings.length}</KeyValue>
                        <KeyValue label="Open high / critical">{openHigh.length}</KeyValue>
                        <KeyValue label="Provider">{run.model_provider}</KeyValue>
                        <KeyValue label="Model">{run.model_name}</KeyValue>
                      </dl>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {(["critical", "high", "medium", "low"] as const).map((sev) => {
                          const n = run.findings.filter((f) => f.severity === sev).length;
                          if (!n) return null;
                          return (
                            <li key={sev} className="flex items-center gap-1.5 text-xs text-[color:var(--ink-3)]">
                              <SeverityChip severity={sev} /> {n}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {tab === "history" && (
                <ol className="divide-y divide-[color:var(--hairline)]">
                  {versions.map((v) => (
                    <li key={v.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-xs uppercase tracking-[0.1em] text-[color:var(--ink)]">
                          Version {v.version}
                          {v.version === item.current_version && (
                            <span className="ml-2 rounded-[3px] border border-[color:var(--pass)] px-1.5 py-0.5 text-[10px] text-[color:var(--pass)]">
                              current
                            </span>
                          )}
                        </p>
                        <time className="font-mono text-[10px] tabular-nums text-[color:var(--ink-3)]" dateTime={v.created_at}>
                          {new Date(v.created_at).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--ink-2)]">{v.notes || "—"}</p>
                      <details className="group mt-2">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]">
                          <Icon name="chevron" size={11} className="transition-transform group-open:rotate-90" /> Show text
                        </summary>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-[4px] border border-[color:var(--hairline)] bg-[color:var(--paper-2)] p-2 font-doc text-[14px] leading-relaxed text-[color:var(--ink-2)]">
{v.body_text}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ol>
              )}

              {tab === "comments" && (
                <>
                  <ul className="mb-4 divide-y divide-[color:var(--hairline)]">
                    {comments.length === 0 && <li className="py-2 text-sm text-[color:var(--ink-3)]">No comments yet.</li>}
                    {comments.map((c) => (
                      <li key={c.id} className="py-3">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                          <span className="text-[color:var(--ink)]">{c.author}</span>
                          <span className="capitalize">{c.author_role.replace("_", " ")}</span>
                          <Tag tone={c.visibility === "external" ? "amber" : "neutral"}>{c.visibility}</Tag>
                          <time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString()}</time>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink)]">{c.body}</p>
                      </li>
                    ))}
                  </ul>
                  <form onSubmit={addComment}>
                    <Field label="Add a comment" htmlFor="new-comment">
                      <TextArea id="new-comment" value={comment} onChange={(e) => setComment(e.target.value)}
                                placeholder="What should change before approval?" />
                    </Field>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
                        Visibility
                        <select
                          value={visibility}
                          onChange={(e) => setVisibility(e.target.value as any)}
                          className="rounded-[4px] border border-[color:var(--hairline-strong)] bg-[color:var(--paper)] px-2 py-1 font-sans text-xs normal-case tracking-normal text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
                        >
                          <option value="internal">Internal</option>
                          <option value="external">Visible to external creator</option>
                        </select>
                      </label>
                      <Button type="submit" variant="primary" loading={busy} disabled={!comment.trim()}>Post comment</Button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>

          <div className="rounded-[10px] border border-[color:var(--hairline)] bg-[color:var(--paper)] p-5">
            <SectionHeading title="Timeline" subtitle="Every version, decision and comment, in order" />
            {timeline.length === 0 ? (
              <p className="text-sm text-[color:var(--ink-3)]">Nothing has happened to this submission yet.</p>
            ) : (
              <ol className="relative ml-1 border-l-[1.5px] border-[color:var(--hairline)]">
                {timeline.map((event, i) => {
                  const newest = i === 0;
                  return (
                    <li
                      key={`${event.at}-${i}`}
                      className="relative pb-4 pl-5 last:pb-0"
                      style={{ animationDelay: `${Math.min(i, 11) * 60}ms` }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute -left-[5px] top-1.5 h-[9px] w-[9px] rounded-full border-2"
                        style={
                          newest
                            ? { borderColor: "var(--mark)", background: "var(--mark)" }
                            : { borderColor: "var(--hairline-strong)", background: "var(--paper)" }
                        }
                      />
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className={`text-sm font-semibold ${newest ? "text-[color:var(--ink)]" : "text-[color:var(--ink-2)]"}`}>
                          {labelFor(event.kind)}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
                          v{event.version}
                        </span>
                        <time className="font-mono text-[10px] tabular-nums text-[color:var(--ink-3)]" dateTime={event.at}>
                          {new Date(event.at).toLocaleString("en-GB", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ink-2)]">
                        <span className="text-[color:var(--ink)]">{event.actor}</span> — {event.detail}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------- decision panel */}
        <aside>
          <div className="sticky top-20 rounded-[10px] border-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper)]">
            <div className="flex items-baseline justify-between border-b border-[color:var(--hairline)] px-4 py-2.5">
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">Decision</p>
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">Manager / Approver</p>
            </div>

            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-3)]">Status</span>
                <StatusPill status={item.status} />
              </div>

              {blocking && (
                <p className="mb-3 rounded-[6px] border-l-[3px] border-[color:var(--warn)] bg-[color:var(--paper-2)] px-3 py-2 text-xs leading-relaxed text-[color:var(--warn)]" role="note">
                  You own this item, so you cannot approve it yourself. Ask another manager or the compliance Approver.
                </p>
              )}

              {!canApprove && (
                <p className="mb-3 rounded-[6px] border border-[color:var(--hairline)] bg-[color:var(--paper-2)] px-3 py-2 text-xs leading-relaxed text-[color:var(--ink-3)]">
                  Your role cannot approve content. You can comment and submit.
                </p>
              )}

              <Field label="Reason (required to reject or request changes)" htmlFor="decision-reason">
                <TextArea id="decision-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                          placeholder="What must change before this can be published?" />
              </Field>

              <div className="flex flex-col gap-2">
                <Button variant="primary" disabled={!canApprove || blocking || busy} onClick={() => act("approve")}>
                  Approve version {item.current_version}
                </Button>
                <Button disabled={!canApprove || blocking || busy} onClick={() => act("request_changes")}>
                  Request changes
                </Button>
                <Button variant="danger" disabled={!canApprove || blocking || busy || !reason.trim()} onClick={() => act("reject")}>
                  Reject
                </Button>
              </div>

              {/* the gate says why it is shut, in words, right where the button is */}
              {(blocking || !canApprove) && (
                <p className="mt-2 border-l-2 border-[color:var(--warn)] pl-2 text-[11px] leading-relaxed text-[color:var(--warn)]">
                  {blocking
                    ? "The gate stays shut until someone else decides. You cannot approve your own submission."
                    : "The gate stays shut for your role. Ask a Manager or the compliance Approver to decide."}
                </p>
              )}

              <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--ink-3)]">
                Approval records a human decision in the audit log. Sentinel never publishes content and never approves
                on a person&apos;s behalf.
              </p>

              {openHigh.length > 0 && (
                <p className="mt-3 flex items-start gap-2 rounded-[6px] border border-[color:var(--mark)] bg-[color:var(--mark-tint)] px-3 py-2 text-xs leading-relaxed text-[color:var(--mark-text)]">
                  <Icon name="alert" size={14} />
                  <span>
                    {openHigh.length} high or critical finding{openHigh.length === 1 ? "" : "s"} still open. Approving now
                    is a human decision that will be visible in analytics and the audit log.
                  </span>
                </p>
              )}
            </div>

            {approvals.length > 0 && (
              <div className="border-t border-[color:var(--hairline)] px-4 py-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-3)]">Recorded decisions</p>
                <ul className="space-y-2 text-xs">
                  {approvals.map((a) => (
                    <li key={a.id} className="border-l-2 border-[color:var(--hairline-strong)] pl-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink)]">
                        {a.action.replace("_", " ")} · v{a.version}
                      </p>
                      <p className="text-[color:var(--ink-3)]">{a.actor} · {a.actor_role}</p>
                      {a.reason && <p className="mt-0.5 text-[color:var(--ink-2)]">“{a.reason}”</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Plain-language label for a timeline event kind; unknown kinds are left alone. */
function labelFor(kind: string): string {
  const LABELS: Record<string, string> = {
    created: "Created",
    version_created: "New version",
    version: "New version",
    submitted: "Submitted for approval",
    submitted_for_approval: "Submitted for approval",
    approved: "Approved",
    rejected: "Rejected",
    changes_requested: "Changes requested",
    commented: "Comment",
    comment: "Comment",
    finding_decision: "Finding decided",
    review_completed: "Review completed",
  };
  return LABELS[kind] ?? kind.replace(/_/g, " ");
}
