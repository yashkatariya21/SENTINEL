"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ContentItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, EmptyState, SectionHeading, SeverityChip, Skeleton, StatusPill, Tag } from "./components/ui";

interface Summary {
  brand_score: number;
  formula: string;
  submissions: number;
  findings_by_severity: Record<string, number>;
  findings_by_reviewer: Record<string, number>;
  most_common_mistakes: { rule_key: string; count: number; example_issue: string }[];
  average_approval_hours: number | null;
  brand_health_trend: { week_start: string; brand_score: number | null; submissions: number }[];
  provider: { provider: string; model: string; prompt_version: string };
}

export default function OverviewPage() {
  const { me, can } = useAuth();
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<ContentItem[]>("/content").then(setItems).catch((e) => setError(e.message));
    if (can("can_read_analytics")) {
      api.get<Summary>("/analytics/summary").then(setSummary).catch(() => setSummary(null));
    }
  }, [can]);

  const pending = (items || []).filter((i) => i.status === "in_review");
  const mine = (items || []).filter((i) => i.owner_id === me?.user.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Good to see you, {me?.user.name.split(" ")[0]}.
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-mute">
            Six specialist reviewers check content against the {me?.organisation.name} Brand Kit. Every finding
            explains itself with a rule and a source; you decide what happens next.
          </p>
        </div>
        <Link href="/new"><Button variant="primary">Review new content</Button></Link>
      </div>

      {error && <Card className="mb-4 border-danger-500/40 p-4 text-sm text-danger-700">{error}</Card>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* brand score */}
        <Card className="p-5">
          <SectionHeading title="Brand Score" subtitle="Last 90 days across the workspace" />
          {summary ? (
            <>
              <div className="flex items-end gap-3">
                <p className="text-4xl font-semibold tracking-tight text-ink">{summary.brand_score}</p>
                <p className="pb-1 text-sm text-ink-mute">/ 100</p>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink/10" role="img"
                   aria-label={`Brand score ${summary.brand_score} out of 100`}>
                <div className="h-full rounded-full bg-navy-700" style={{ width: `${summary.brand_score}%` }} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">{summary.formula}</p>
              <Link href="/analytics" className="mt-3 inline-block text-xs font-medium text-navy-700 hover:underline">
                Open analytics →
              </Link>
            </>
          ) : can("can_read_analytics") ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <p className="text-sm text-ink-mute">Analytics are available to managers and above.</p>
          )}
        </Card>

        {/* queue */}
        <Card className="p-5">
          <SectionHeading title="Waiting on a human" subtitle="Items in review across your workspace" />
          {!items ? <Skeleton className="h-24 w-full" /> : pending.length === 0 ? (
            <p className="text-sm text-ink-mute">Nothing is waiting for approval right now.</p>
          ) : (
            <ul className="space-y-2">
              {pending.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link href={`/content/${item.id}/approval`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm hover:bg-paper">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{item.title}</span>
                      <span className="text-xs text-ink-mute">{item.owner_name} · {item.department}</span>
                    </span>
                    <StatusPill status={item.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* my content */}
        <Card className="p-5">
          <SectionHeading title="Your recent submissions" subtitle="Drafts and reviews you own" />
          {!items ? <Skeleton className="h-24 w-full" /> : mine.length === 0 ? (
            <p className="text-sm text-ink-mute">You have not submitted any content yet.</p>
          ) : (
            <ul className="space-y-2">
              {mine.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link href={`/content/${item.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm hover:bg-paper">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{item.title}</span>
                      <span className="text-xs text-ink-mute">{item.content_type.replace("_", " ")} · v{item.current_version}</span>
                    </span>
                    <StatusPill status={item.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* how it works + guardrails */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionHeading title="How a review runs"
                         subtitle="Deterministic checks first, then six reviewers in parallel, then de-duplication and confidence scoring." />
          <ol className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["1. Extract", "Text blocks and images from pasted text, DOCX, PDF or image uploads."],
              ["2. Deterministic checks", "Approved and banned terms, colour values, alt text, WCAG contrast — Confirmed findings with a rule ID."],
              ["3. Retrieve", "Rules, terms and facts filtered to the organisation, plus brand-kit chunks from pgvector."],
              ["4. Six reviewers", "Brand Voice, Terminology, Fact Checker, Visual, Accessibility, Legal — strict JSON, span-level."],
              ["5. Merge & score", "Duplicates merged by span overlap; confidence from repeat-run agreement, evidence strength and deterministic backing."],
              ["6. Human decision", "Accept, edit, dismiss with reason, or escalate. A manager override can become a rule — only after they answer the prompt."],
            ].map(([title, body]) => (
              <li key={title} className="rounded-lg border border-ink/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-navy-700">{title}</p>
                <p className="mt-1 text-sm text-ink-soft">{body}</p>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="p-5">
          <SectionHeading title="Guardrails" subtitle="Design constraints, not settings" />
          <ul className="space-y-2 text-sm text-ink-soft">
            {[
              "Never publishes content.",
              "Never auto-fixes: a suggestion may only change the flagged span.",
              "Never changes a rule without a manager's click.",
              "Legal and accessibility rules need an Approver.",
              "Nobody approves their own item.",
              "Submitted content is data, never instructions.",
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="text-ok-600">✓</span> {line}
              </li>
            ))}
          </ul>
          {summary && (
            <p className="mt-4 border-t border-ink/10 pt-3 text-[11px] text-ink-mute">
              AI provider <span className="font-medium text-ink-soft">{summary.provider.provider}</span> · model{" "}
              {summary.provider.model} · prompt {summary.provider.prompt_version}
            </p>
          )}
        </Card>
      </div>

      {summary && summary.most_common_mistakes.length > 0 && (
        <Card className="mt-4 p-5">
          <SectionHeading title="Most common mistakes" subtitle="Where the team keeps drifting from the Brand Kit" />
          <ul className="space-y-2">
            {summary.most_common_mistakes.slice(0, 5).map((m) => (
              <li key={m.rule_key} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0"><Tag>{m.rule_key}</Tag></span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                  <span className="block h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.min(100, (m.count / Math.max(1, summary.most_common_mistakes[0].count)) * 100)}%` }} />
                </span>
                <span className="w-8 text-right text-xs text-ink-mute">{m.count}</span>
                <span className="hidden flex-1 truncate text-xs text-ink-soft sm:block">{m.example_issue}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
