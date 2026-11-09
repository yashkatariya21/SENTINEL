"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, AnalysisRun, ContentItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Button, Card, Field, KeyValue, SectionHeading, SeverityChip, Skeleton, StatusPill,
  Tag, TextArea, useToast,
} from "../../../components/ui";

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

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="mb-1 text-xs text-ink-mute" aria-label="Breadcrumb">
            <Link href="/content" className="hover:underline">Content queue</Link> <span aria-hidden="true">/</span> Approval
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{item.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <div>
          <Card className="mb-4">
            <div className="flex gap-1 border-b border-ink/10 p-2" role="tablist" aria-label="Approval detail">
              {([
                ["content", "Content"],
                ["history", `Version history (${versions.length})`],
                ["comments", `Comments (${comments.length})`],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`rounded-md px-3 py-1.5 text-sm ${tab === key ? "bg-navy-700 text-white" : "text-ink-soft hover:bg-paper"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {tab === "content" && (
                <>
                  <SectionHeading title={`Version ${item.current_version}`}
                                 subtitle={`Submitted ${item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "not yet submitted"}`} />
                  <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-ink/10 bg-paper p-4 text-sm leading-7 text-ink">
                    {item.version?.body_text}
                  </div>

                  {run && (
                    <div className="mt-4">
                      <SectionHeading title="Latest review" subtitle="Recorded with provider, model and prompt version" />
                      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
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
                            <li key={sev} className="flex items-center gap-1.5 text-xs text-ink-mute">
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
                <ol className="space-y-3">
                  {versions.map((v) => (
                    <li key={v.id} className="rounded-lg border border-ink/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-ink">Version {v.version}
                          {v.version === item.current_version && <span className="ml-2 text-xs text-ok-600">current</span>}
                        </p>
                        <time className="text-xs text-ink-mute" dateTime={v.created_at}>
                          {new Date(v.created_at).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">{v.notes || "—"}</p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-navy-700">Show text</summary>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-paper p-2 text-xs text-ink-soft">
{v.body_text}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ol>
              )}

              {tab === "comments" && (
                <>
                  <ul className="mb-4 space-y-3">
                    {comments.length === 0 && <li className="text-sm text-ink-mute">No comments yet.</li>}
                    {comments.map((c) => (
                      <li key={c.id} className="rounded-lg border border-ink/10 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-mute">
                          <span className="font-medium text-ink-soft">{c.author}</span>
                          <span className="capitalize">{c.author_role.replace("_", " ")}</span>
                          <Tag tone={c.visibility === "external" ? "amber" : "neutral"}>{c.visibility}</Tag>
                          <time dateTime={c.created_at}>{new Date(c.created_at).toLocaleString()}</time>
                        </div>
                        <p className="mt-1 text-sm text-ink">{c.body}</p>
                      </li>
                    ))}
                  </ul>
                  <form onSubmit={addComment}>
                    <Field label="Add a comment" htmlFor="new-comment">
                      <TextArea id="new-comment" value={comment} onChange={(e) => setComment(e.target.value)}
                                placeholder="What should change before approval?" />
                    </Field>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs text-ink-soft">
                        Visibility
                        <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}
                                className="rounded border border-ink/20 px-2 py-1 text-xs">
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
          </Card>

          <Card className="p-5">
            <SectionHeading title="Timeline" subtitle="Every version, decision and comment, in order" />
            <ol className="space-y-2">
              {timeline.map((event, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <time className="w-32 shrink-0 text-xs text-ink-mute" dateTime={event.at}>
                    {new Date(event.at).toLocaleDateString()}
                  </time>
                  <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-navy-500" />
                  <span className="text-ink-soft">
                    <span className="font-medium text-ink">{event.actor}</span> · {event.kind} · v{event.version} —{" "}
                    {event.detail}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* decision panel */}
        <aside>
          <Card className="sticky top-16 p-5">
            <SectionHeading title="Decision" subtitle="Manager and Approver roles only" />

            {blocking && (
              <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-100 px-3 py-2 text-xs text-amber-700" role="note">
                You own this item, so you cannot approve it yourself. Ask another manager or the compliance Approver.
              </p>
            )}

            {!canApprove && (
              <p className="mb-3 rounded-lg border border-ink/10 bg-paper px-3 py-2 text-xs text-ink-mute">
                Your role cannot approve content. You can comment and submit.
              </p>
            )}

            <p className="mb-2 text-xs text-ink-mute">
              Status: <StatusPill status={item.status} />
            </p>

            <Field label="Reason (required to reject or request changes)" htmlFor="decision-reason">
              <TextArea id="decision-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder="What must change before this can be published?" />
            </Field>

            <div className="flex flex-col gap-2">
              <Button variant="primary" disabled={!canApprove || blocking || busy}
                      onClick={() => act("approve")}>
                Approve version {item.current_version}
              </Button>
              <Button disabled={!canApprove || blocking || busy} onClick={() => act("request_changes")}>
                Request changes
              </Button>
              <Button variant="danger" disabled={!canApprove || blocking || busy || !reason.trim()}
                      onClick={() => act("reject")}>
                Reject
              </Button>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">
              Approval records a human decision in the audit log. Sentinel never publishes content and never approves
              on a person&apos;s behalf.
            </p>

            {approvals.length > 0 && (
              <div className="mt-4 border-t border-ink/10 pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">Recorded decisions</p>
                <ul className="space-y-2 text-xs">
                  {approvals.map((a) => (
                    <li key={a.id} className="rounded border border-ink/10 p-2">
                      <p className="font-medium capitalize text-ink">{a.action.replace("_", " ")}</p>
                      <p className="text-ink-mute">{a.actor} · {a.actor_role} · v{a.version}</p>
                      {a.reason && <p className="mt-1 text-ink-soft">“{a.reason}”</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {openHigh.length > 0 && (
              <p className="mt-4 rounded-lg border border-danger-500/30 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                {openHigh.length} high or critical finding{openHigh.length === 1 ? "" : "s"} still open. Approving now is
                a human decision that will be visible in analytics and the audit log.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
