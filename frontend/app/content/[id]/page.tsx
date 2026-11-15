"use client";
/**
 * The proof desk.
 *
 * A draft is the hero of this screen: marked up by six reviewers, annotated in the
 * margin, and held at a gate until a person decides. Nothing on this page publishes,
 * rewrites or changes a rule — the buttons record decisions, and the gate reacts to them.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, AnalysisRun, ContentItem, Finding, fetchBlob } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LearningPrompt, LearningPromptData } from "../../components/LearningPrompt";
import { Skeleton, StatusPill, useToast } from "../../components/ui";
import { GateStrip, DeskSentri } from "../../components/Desk";
import { Icon } from "../../components/Icon";
import { MarkedDraft, MarginNote, numbered, type DecisionAction } from "../../components/proof/Manuscript";
import { PaperTrail, ReviewerChecks, VerdictCard, verdictFor } from "../../components/proof/Panels";

type Tab = "proof" | "history" | "audit" | "rules";

/** The demo workspace's departments; used only by the learning prompt's scope picker. */
const DEPARTMENTS = ["Marketing", "Product", "Sales", "Support", "Executive"];

interface TimelineEvent {
  at: string;
  kind: string;
  version: number;
  actor: string;
  detail: string;
}

export default function ProofDeskPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { me, can } = useAuth();
  const { push } = useToast();

  const [item, setItem] = useState<ContentItem | null>(null);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("proof");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "decided">("all");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<LearningPromptData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [auditRows, setAuditRows] = useState<{ id: string; action: string; actor: string; created_at: string; entry_hash: string }[] | null>(null);

  const loadItem = useCallback(async () => {
    const data = await api.get<ContentItem>(`/content/${id}`);
    setItem(data);
    return data;
  }, [id]);

  const loadRun = useCallback(async (runId: string) => {
    const data = await api.get<AnalysisRun>(`/analysis-runs/${runId}`);
    setRun(data);
    return data;
  }, []);

  const startAnalysis = useCallback(async () => {
    const created = await api.post<AnalysisRun>(`/content/${id}/analyze`);
    setRun({ ...created, findings: [] });
    return created;
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const data = await loadItem();
        if (data.active_run_id) {
          const existing = await loadRun(data.active_run_id);
          if (existing.content_version_id !== data.version?.id) await startAnalysis();
        } else if (can("can_write_kit") || me?.user.role !== "external_creator") {
          await startAnalysis();
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "This draft could not be opened.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // poll while the reviewers are reading
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const timer = setInterval(async () => {
      try {
        const next = await loadRun(run.id);
        if (next.status === "complete" || next.status === "failed") clearInterval(timer);
      } catch {
        /* keep polling */
      }
    }, 900);
    return () => clearInterval(timer);
  }, [run, loadRun]);

  // the history tab is fetched when it is first opened, never on load
  useEffect(() => {
    if (tab !== "history" || timeline.length) return;
    api
      .get<{ events: TimelineEvent[] }>(`/content/${id}/timeline`)
      .then((d) => setTimeline(d.events))
      .catch(() => setTimeline([]));
  }, [tab, id, timeline.length]);

  useEffect(() => {
    if (tab !== "audit" || auditRows || !can("can_read_audit")) return;
    api
      .get<{ entries: { id: string; action: string; actor: string; created_at: string; entry_hash: string; entity_id: string | null }[] }>("/audit?limit=200")
      .then((d) => setAuditRows(d.entries.filter((e) => e.entity_id === id)))
      .catch(() => setAuditRows([]));
  }, [tab, id, auditRows, can]);

  const findings = useMemo(() => run?.findings ?? [], [run]);
  const order = useMemo(() => numbered(findings), [findings]);
  const visible = useMemo(
    () =>
      order.filter((f) =>
        filter === "all" ? true : filter === "open" ? f.decision_status === "open" : f.decision_status !== "open",
      ),
    [order, filter],
  );

  const bodyText = item?.version?.body_text ?? "";
  const running = run?.status === "queued" || run?.status === "running";
  const isOwner = item?.owner_id === me?.user.id;
  const verdict = verdictFor({ findings, status: item?.status, canApprove: can("can_approve"), isOwner, running });

  /* ------------------------------------------------------------------ linking */
  const goToNote = useCallback((findingId: string) => {
    setActiveId(findingId);
    const el = document.getElementById(`note-${findingId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus?.({ preventScroll: true });
  }, []);

  const goToMark = useCallback((findingId: string) => {
    setActiveId(findingId);
    const el = document.getElementById(`mark-${findingId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("hl-active");
    void (el as HTMLElement).offsetWidth;
    el.classList.add("hl-active");
  }, []);

  /* ----------------------------------------------------------------- decisions */
  async function onDecision(
    finding: Finding,
    action: DecisionAction,
    payload: { reason?: string; edited_suggestion?: string },
  ) {
    setBusy(true);
    try {
      const res = await api.post<{
        learning_prompt: { override_id: string; requires_approver: boolean } | null;
      }>(`/findings/${finding.id}/decision`, {
        action,
        ...payload,
      });
      push(
        action === "accept" ? "Accepted. The note is recorded." :
        action === "dismiss" ? "Dismissed with a reason on the record." :
        action === "escalate" ? "Escalated to a manager." : "Wording saved as a decision.",
        "ok",
      );
      if (res.learning_prompt) {
        setPrompt({
          overrideId: res.learning_prompt.override_id,
          findingIssue: finding.issue,
          requiresApprover: Boolean(res.learning_prompt.requires_approver),
          category: finding.category,
        });
      }
      if (run) await loadRun(run.id);
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "That decision was not recorded.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "approve" | "request_changes") {
    setBusy(true);
    try {
      await api.post(`/content/${id}/approve`, { action, reason: reasonText || undefined });
      push(
        action === "approve"
          ? "Approved. Sentinel did not publish it — that stays with your publishing tool."
          : "Changes requested. Nothing was published.",
        "ok",
      );
      await loadItem();
    } catch (err: unknown) {
      push(err instanceof Error ? err.message : "That decision was not recorded.", "error");
    } finally {
      setBusy(false);
    }
  }
  const [reasonText] = useState("");

  if (error) {
    return (
      <div className="panel border-mark p-5" role="alert">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mark-text">Could not open this draft</p>
        <p className="mt-1 text-sm text-ink">{error}</p>
        <Link href="/content" className="link-under mt-3 inline-block text-sm text-ink">
          Back to the queue
        </Link>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
          <Skeleton className="h-[420px] w-full" />
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const gateStep = item.status === "approved" ? 3 : findings.length && !running ? 2 : running ? 1 : 0;

  return (
    <div>
      {/* ------------------------------------------------------------- title row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
            <Link href="/content" className="hover:text-ink">Content queue</Link>
            <span aria-hidden="true"> / </span>
            Proof desk
          </nav>
          <h1 className="mt-1 truncate text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {item.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-2">
            <StatusPill status={item.status} />
            <span>{item.owner_name ?? "No owner"} · {item.department || "No department"}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute">
              v{item.current_version} · {item.content_type.replace("_", " ")}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute">
              {findings.length} finding{findings.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={async () => {
              try {
                const blob = await fetchBlob(`/content/${id}/report.pdf`);
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank", "noopener");
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              } catch (err: unknown) {
                push(err instanceof Error ? err.message : "The PDF could not be built.", "error");
              }
            }}
            disabled={run?.status !== "complete"}
            className="min-h-[36px] rounded-[7px] border-[1.5px] border-ink px-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink hover:bg-ink hover:text-ivory disabled:opacity-40"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              try {
                await startAnalysis();
                push("The six reviewers are reading this version again.", "ok");
              } catch (err: unknown) {
                push(err instanceof Error ? err.message : "The re-run did not start.", "error");
              } finally {
                setBusy(false);
              }
            }}
            disabled={running || busy}
            className="min-h-[36px] rounded-[7px] border-[1.5px] border-ink/25 px-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 hover:border-ink hover:text-ink disabled:opacity-40"
          >
            {running ? "Reading…" : "Re-run review"}
          </button>
          <Link
            href={`/content/${id}/approval`}
            className="min-h-[36px] rounded-[7px] border-[1.5px] border-ink/25 px-2.5 font-mono text-[10px] uppercase leading-[36px] tracking-[0.1em] text-ink-2 hover:border-ink hover:text-ink"
          >
            Approval view
          </Link>
        </div>
      </div>

      {/* ----------------------------------------------------------------- tabs */}
      <div className="mt-4 flex items-center gap-4 border-b-[1.5px] border-ink/15" role="tablist" aria-label="Proof desk sections">
        {([
          ["proof", "Proof"],
          ["history", "History"],
          ["audit", "Audit"],
          ["rules", "Rules used"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-[1.5px] border-b-[3px] pb-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-micro ${
              tab === key ? "border-mark text-ink" : "border-transparent text-ink-mute hover:text-ink"
            }`}
          >
            {label}
            {key === "audit" && !can("can_read_audit") && <span className="sr-only"> (restricted)</span>}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- proof */}
      {tab === "proof" && (
        <div className="mt-3 grid items-start gap-3 lg:grid-cols-[1.55fr_1fr]">
          {/* manuscript + margin notes */}
          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-ink/15 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
                Draft · version {item.current_version}
              </p>
              <div className="flex items-center gap-1" role="group" aria-label="Filter notes">
                {(["all", "open", "decided"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${
                      filter === f ? "bg-ink text-ivory" : "text-ink-mute hover:text-ink"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {running ? (
              <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                <DeskSentri size={104} mood="reading" />
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-mute">
                  Six reviewers reading · {run?.repeat_runs ?? 1} repeat{run?.repeat_runs === 1 ? "" : "s"}
                </p>
                <p className="max-w-[38ch] text-[13px] text-ink-2">
                  They read the draft against the Brand Kit, then merge duplicates and score confidence.
                </p>
              </div>
            ) : run?.status === "failed" ? (
              <p className="m-3 rounded-[7px] border-[1.5px] border-mark bg-mark-tint p-3 text-[13px] text-mark-text" role="alert">
                The review failed: {run.error}
              </p>
            ) : (
              <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(260px,0.85fr)]">
                <div className="border-b-[1.5px] border-dashed border-mark/60 p-4 md:border-b-0 md:border-r-[1.5px] md:border-r-mark/60">
                  <MarkedDraft
                    text={bodyText}
                    findings={visible}
                    order={order}
                    activeId={activeId}
                    onSelect={goToNote}
                  />
                  <div className="mt-4 border-t-[1.5px] border-ink/15 pt-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
                      {findings.length - verdict.open === findings.length
                        ? "Nothing auto-fixes. Every decision is yours."
                        : "Nothing auto-fixes · marks are quotes, not edits"}
                    </p>
                  </div>
                </div>

                <div className="max-h-[560px] space-y-2 overflow-y-auto bg-paper/60 p-2.5" aria-label="Margin notes">
                  {visible.length === 0 ? (
                    <div className="px-2 py-8 text-center">
                      <p className="text-[13px] text-ink-2">
                        {filter === "decided" ? "Nothing decided yet." : "No notes under this filter."}
                      </p>
                      <button
                        type="button"
                        onClick={() => setFilter("all")}
                        className="link-under mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink"
                      >
                        Show all notes
                      </button>
                    </div>
                  ) : (
                    visible.map((f) => (
                      <MarginNote
                        key={f.id}
                        finding={f}
                        number={order.findIndex((o) => o.id === f.id) + 1}
                        active={activeId === f.id}
                        onFocusNote={goToMark}
                        onDecision={onDecision}
                        busy={busy}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* right column */}
          <div className="space-y-3">
            <VerdictCard
              verdict={verdict}
              busy={busy}
              onApprove={() => decide("approve")}
              onRequestChanges={() => decide("request_changes")}
            />
            <ReviewerChecks run={run} />
            <PaperTrail findings={findings} item={item} run={run} canReadAudit={can("can_read_audit")} />
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------- history */}
      {tab === "history" && (
        <div className="mt-3 panel p-4">
          <h2 className="eyebrow">Every version, decision and comment, in order</h2>
          {timeline.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-2">Nothing has happened to this draft yet.</p>
          ) : (
            <ol className="mt-3 border-l-[1.5px] border-ink/20">
              {timeline.map((e, i) => (
                <li key={i} className="relative pb-3 pl-4 last:pb-0">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[5px] top-1.5 h-[8px] w-[8px] rounded-full border-[1.5px] border-ink ${
                      i === 0 ? "bg-highlight" : "bg-ivory"
                    }`}
                  />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-ink">{e.kind.replace(/_/g, " ")}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute">v{e.version}</span>
                    <time className="font-mono text-[10px] tabular-nums text-ink-mute" dateTime={e.at}>
                      {new Date(e.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </div>
                  <p className="text-[12px] text-ink-2">{e.actor} — {e.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- audit */}
      {tab === "audit" && (
        <div className="mt-3 panel p-4">
          <h2 className="eyebrow">Entries for this draft</h2>
          {!can("can_read_audit") ? (
            <p className="mt-2 text-[13px] text-ink-2">
              Your role can review content and raise findings, but not read the audit trail. Ask an Admin for an export.
            </p>
          ) : auditRows === null ? (
            <Skeleton className="mt-3 h-24 w-full" />
          ) : auditRows.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-2">No audit entries mention this draft yet.</p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-ink/10">
                {auditRows.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-2 py-1.5 text-[12px]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink">{e.action}</span>
                    <span className="text-ink-2">{e.actor}</span>
                    <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-mute">
                      {new Date(e.created_at).toLocaleString("en-GB")} · {e.entry_hash.slice(0, 8)}…
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/audit" className="link-under mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.12em] text-ink">
                Open the full chain
              </Link>
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- rules */}
      {tab === "rules" && (
        <div className="mt-3 panel p-4">
          <h2 className="eyebrow">Rule versions applied to this review</h2>
          {run?.rule_versions?.length ? (
            <ul className="mt-2 divide-y divide-ink/10">
              {run.rule_versions.map((r) => (
                <li key={r.key} className="flex flex-wrap items-baseline gap-2 py-1.5 text-[12px]">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    {r.key} v{r.version}
                  </span>
                  <span className="text-ink-2">{r.category.replace(/_/g, " ")}</span>
                  {r.requires_approver && (
                    <span className="rounded-full bg-mark-tint px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-mark-text">
                      Needs an approver
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-ink-2">No rule versions are recorded for this run yet.</p>
          )}
          <p className="mt-2 border-t border-ink/10 pt-2 text-[11px] text-ink-mute">
            A review is only comparable to another when both ran against the same rule versions. This is the list this
            run used.
          </p>
        </div>
      )}

      {/* ----------------------------------------------------------------- gate */}
      <GateStrip current={gateStep} released={item.status === "approved"} className="mt-3 rounded-[10px]" />

      {prompt && (
        <LearningPrompt
          data={prompt}
          departments={DEPARTMENTS}
          onClose={() => setPrompt(null)}
          onDone={() => setPrompt(null)}
        />
      )}
    </div>
  );
}
