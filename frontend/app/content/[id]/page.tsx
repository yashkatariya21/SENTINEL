"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, AnalysisRun, ContentItem, Finding, REVIEWERS } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { HighlightedText } from "../../components/HighlightedText";
import { FindingCard } from "../../components/FindingCard";
import { LearningPrompt, LearningPromptData } from "../../components/LearningPrompt";
import {
  Button, Card, EmptyState, KeyValue, SectionHeading, SeverityChip, Skeleton, StatusPill,
  Tag, useToast, Select,
} from "../../components/ui";

const SEVERITIES = ["critical", "high", "medium", "low"] as const;

export default function ReviewReportPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { me, can } = useAuth();
  const { push } = useToast();

  const [item, setItem] = useState<ContentItem | null>(null);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<LearningPromptData | null>(null);

  const [severities, setSeverities] = useState<string[]>([...SEVERITIES]);
  const [reviewer, setReviewer] = useState("all");
  const [label, setLabel] = useState("all");
  const [onlyHuman, setOnlyHuman] = useState(false);
  const [groupByReviewer, setGroupByReviewer] = useState(true);

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

  // initial load; start an analysis if this version has never been reviewed
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
      } catch (err: any) {
        setError(err.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // poll while the background task runs
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const timer = setInterval(async () => {
      try {
        const next = await loadRun(run.id);
        if (next.status === "complete" || next.status === "failed") clearInterval(timer);
      } catch { /* keep polling */ }
    }, 900);
    return () => clearInterval(timer);
  }, [run, loadRun]);

  const findings = run?.findings ?? [];

  const filtered = useMemo(() => findings.filter((f) => {
    if (!severities.includes(f.severity)) return false;
    if (reviewer !== "all" && f.reviewer !== reviewer) return false;
    if (label !== "all" && f.label !== label) return false;
    if (onlyHuman && !f.human_review_required) return false;
    return true;
  }), [findings, severities, reviewer, label, onlyHuman]);

  const counts = useMemo(() => {
    const by: Record<string, number> = {};
    findings.forEach((f) => { by[f.reviewer] = (by[f.reviewer] || 0) + 1; });
    return {
      total: findings.length,
      confirmed: findings.filter((f) => f.label === "confirmed").length,
      possible: findings.filter((f) => f.label === "possible").length,
      human: findings.filter((f) => f.human_review_required).length,
      byReviewer: by,
    };
  }, [findings]);

  const groups = useMemo(() => {
    if (!groupByReviewer) return [{ key: "all", items: filtered }];
    return Object.keys(REVIEWERS)
      .map((key) => ({ key, items: filtered.filter((f) => f.reviewer === key) }))
      .filter((g) => g.items.length > 0);
  }, [filtered, groupByReviewer]);

  async function onDecision(
    finding: Finding,
    action: "accept" | "edit" | "dismiss" | "escalate",
    payload: { reason?: string; edited_suggestion?: string },
  ) {
    try {
      const res = await api.post<{ learning_prompt: any }>(`/findings/${finding.id}/decision`, {
        action, ...payload,
      });
      push(action === "accept" ? "Finding accepted." : "Decision recorded.", "ok");
      if (res.learning_prompt) {
        setPrompt({
          overrideId: res.learning_prompt.override_id,
          findingIssue: finding.issue,
          requiresApprover: res.learning_prompt.requires_approver,
          category: finding.category,
        });
      }
      if (run) await loadRun(run.id);
    } catch (err: any) {
      push(err.message, "error");
    }
  }

  function focusFinding(findingId: string) {
    setActiveId(findingId);
    const el = document.getElementById(`finding-${findingId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }

  if (error) {
    return <Card className="p-6 text-sm text-danger-700" role="alert">{error}</Card>;
  }

  const bodyText = item?.version?.body_text ?? "";
  const injection = run?.stats?.injection;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="mb-1 text-xs text-ink-mute" aria-label="Breadcrumb">
            <Link href="/content" className="hover:underline">Content queue</Link> <span aria-hidden="true">/</span> Review report
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{item?.title ?? "Review report"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
            {item && <StatusPill status={item.status} />}
            <Tag>{item?.content_type.replace("_", " ")}</Tag>
            <Tag>{item?.department || "No department"}</Tag>
            <Tag>Owner: {item?.owner_name}</Tag>
            <Tag>Version {item?.current_version}</Tag>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => startAnalysis()} disabled={run?.status === "running"}>
            Re-run review
          </Button>
          <Link href={`/content/${id}/approval`}>
            <Button variant="primary">Approval view</Button>
          </Link>
        </div>
      </div>

      {run && (run.status === "queued" || run.status === "running") && (
        <Card className="mb-4 flex items-center gap-3 p-4 text-sm text-ink-soft" role="status" aria-live="polite">
          <Skeleton className="h-4 w-4 rounded-full" />
          Running six reviewers in parallel over {run.repeat_runs} repeat{run.repeat_runs > 1 ? "s" : ""} for cross-run
          agreement…
        </Card>
      )}

      {run?.status === "failed" && (
        <Card className="mb-4 border-danger-500/40 bg-danger-50 p-4 text-sm text-danger-700" role="alert">
          Review failed: {run.error}
        </Card>
      )}

      {/* run provenance */}
      {run && run.status === "complete" && (
        <Card className="mb-4 p-4">
          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <KeyValue label="Findings">{counts.total}</KeyValue>
            <KeyValue label="Confirmed">{counts.confirmed}</KeyValue>
            <KeyValue label="Possible">{counts.possible}</KeyValue>
            <KeyValue label="Human review">{counts.human}</KeyValue>
            <KeyValue label="Rules applied">{run.rule_versions.length}</KeyValue>
            <KeyValue label="Words">{run.stats?.words ?? "—"}</KeyValue>
          </dl>
          <p className="mt-3 border-t border-ink/10 pt-2 text-[11px] text-ink-mute">
            AI provider <span className="font-medium text-ink-soft">{run.model_provider}</span> · model{" "}
            <span className="font-medium text-ink-soft">{run.model_name}</span> · embeddings{" "}
            {run.embedding_model} · prompt {run.prompt_version} · {run.repeat_runs} repeat runs ·{" "}
            {run.stats?.duplicates_merged ?? 0} duplicates merged · rule versions{" "}
            {run.rule_versions.map((r) => `${r.key} v${r.version}`).join(", ") || "none"}
          </p>
          {injection?.detected && (
            <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-100 px-3 py-2 text-xs text-amber-700" role="alert">
              <strong>Instruction-like text detected in the submission.</strong> It was treated as content, never as
              instructions: {injection.matches?.join(", ")}.
            </p>
          )}
        </Card>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        {/* content */}
        <div>
          <Card className="p-5">
            <SectionHeading
              title="Submitted content"
              subtitle="Highlighted spans are the only text a suggestion may change. Activate a highlight to open its card."
              action={
                <div className="flex items-center gap-1.5 text-[11px] text-ink-mute">
                  {SEVERITIES.slice().reverse().map((s) => (
                    <span key={s} className="flex items-center gap-1">
                      <SeverityChip severity={s} compact />
                    </span>
                  ))}
                </div>
              }
            />
            {bodyText ? (
              <HighlightedText text={bodyText} findings={filtered} activeId={activeId}
                               onSelect={focusFinding} showHighlights />
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
            {item?.version?.filename && (
              <p className="mt-4 border-t border-ink/10 pt-2 text-xs text-ink-mute">
                Source file: {item.version.filename}
              </p>
            )}
          </Card>

          <Card className="mt-4 p-5">
            <SectionHeading title="What this review did not do"
                           subtitle="Sentinel is a reviewer, not a publisher and not an editor." />
            <ul className="grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
              {[
                "It did not publish or schedule anything.",
                "It did not edit the content — suggestions are proposals only.",
                "It did not change a rule; a manager answers the learning prompt first.",
                "It did not invent citations: findings without a source say “No approved source found”.",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="text-ok-600">✓</span> {line}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* findings panel */}
        <aside aria-label="Findings">
          <Card className="overflow-hidden xl:sticky xl:top-16">
            <div className="border-b border-ink/10 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">
                  Findings <span className="font-normal text-ink-mute">({filtered.length} of {counts.total})</span>
                </h2>
                <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <input type="checkbox" checked={groupByReviewer}
                         onChange={(e) => setGroupByReviewer(e.target.checked)} />
                  Group by reviewer
                </label>
              </div>

              <fieldset className="mb-2">
                <legend className="sr-only">Filter by severity</legend>
                <div className="flex flex-wrap gap-1.5">
                  {SEVERITIES.map((s) => {
                    const on = severities.includes(s);
                    const n = findings.filter((f) => f.severity === s).length;
                    return (
                      <button
                        key={s}
                        aria-pressed={on}
                        onClick={() => setSeverities((prev) =>
                          prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                        className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-ink/30 bg-white text-ink" : "border-ink/10 bg-paper text-ink-mute line-through"}`}
                      >
                        {s} ({n})
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="filter-reviewer" className="mb-1 block text-[11px] text-ink-mute">Reviewer</label>
                  <Select id="filter-reviewer" className="!py-1.5 text-xs" value={reviewer}
                          onChange={(e) => setReviewer(e.target.value)}>
                    <option value="all">All reviewers</option>
                    {Object.entries(REVIEWERS).map(([key, meta]) => (
                      <option key={key} value={key}>{meta.label} ({counts.byReviewer[key] || 0})</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label htmlFor="filter-label" className="mb-1 block text-[11px] text-ink-mute">Label</label>
                  <Select id="filter-label" className="!py-1.5 text-xs" value={label}
                          onChange={(e) => setLabel(e.target.value)}>
                    <option value="all">Confirmed + Possible</option>
                    <option value="confirmed">Confirmed only</option>
                    <option value="possible">Possible only</option>
                  </Select>
                </div>
              </div>

              <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                <input type="checkbox" checked={onlyHuman} onChange={(e) => setOnlyHuman(e.target.checked)} />
                Needs human review only
              </label>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4 xl:max-h-[calc(100vh_-_22rem)]">
              {run && run.status === "complete" && findings.length === 0 && (
                <EmptyState title="No findings"
                            body="Every reviewer checked this content against the Brand Kit and the deterministic rules passed." />
              )}
              {run && run.status === "complete" && findings.length > 0 && filtered.length === 0 && (
                <EmptyState title="No findings match these filters"
                            body="Clear a filter to see the rest of the report." />
              )}
              {groups.map((group) => (
                <section key={group.key} aria-label={group.key === "all" ? "All findings" : REVIEWERS[group.key]?.label}>
                  {groupByReviewer && (
                    <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">
                      {REVIEWERS[group.key]?.label}
                      <span className="rounded bg-paper px-1.5 py-0.5 font-normal normal-case text-ink-mute">
                        {group.items.length}
                      </span>
                    </h3>
                  )}
                  <div className="space-y-3">
                    {group.items.map((finding) => (
                      <FindingCard
                        key={finding.id}
                        finding={finding}
                        index={findings.indexOf(finding)}
                        canDecide={can("can_approve")}
                        active={activeId === finding.id}
                        onActivate={() => setActiveId(finding.id)}
                        onDecision={onDecision}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </Card>
        </aside>
      </div>

      <LearningPrompt
        data={prompt}
        departments={me?.organisation.departments || []}
        onClose={() => setPrompt(null)}
        onDone={() => { if (run) loadRun(run.id); }}
      />
    </div>
  );
}
