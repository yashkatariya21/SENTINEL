"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ContentItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Button, Card, EmptyState, Field, SectionHeading, SeverityChip, Skeleton, StatusPill, Tag, TextArea, useToast,
} from "./components/ui";
import { LoadDemoButton } from "./components/Demo";
import { BrandScoreRing } from "./components/brand/BrandScoreRing";
import { Sentri } from "./components/brand/Sentri";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const { push } = useToast();
  const [draft, setDraft] = useState("");
  const [trying, setTrying] = useState(false);
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
          <p className="font-mono text-2xs uppercase tracking-[0.24em] text-gold-deep">
            {me?.organisation.name} · workspace overview
          </p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-navy">
            Good to see you, {me?.user.name.split(" ")[0]}.
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-mute">
            Six specialist reviewers check content against the {me?.organisation.name} Brand Kit. Every finding
            explains itself with a rule and a source; you decide what happens next.
          </p>
        </div>
        <Link href="/new"><Button variant="primary">Review new content</Button></Link>
      </div>

      {error && <Card className="mb-4 border-critical/40 p-4 text-sm text-critical">{error}</Card>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* brand score */}
        <Card className="relative overflow-hidden p-5">
          <SectionHeading title="Brand Score" subtitle="Last 90 days across the workspace" />
          {summary ? (
            <>
              <div className="flex items-center gap-4">
                <BrandScoreRing value={summary.brand_score} size={104} />
                <div>
                  <p className="font-display text-2xl font-semibold text-navy">
                    {summary.submissions} <span className="text-sm font-normal text-ink-mute">submissions reviewed</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {summary.findings_by_severity.critical ?? 0} critical ·{" "}
                    {summary.findings_by_severity.high ?? 0} high severity findings
                  </p>
                  <p className="mt-1 text-xs text-ink-mute">
                    Average approval {summary.average_approval_hours != null
                      ? `${summary.average_approval_hours.toFixed(1)} h`
                      : "not measured yet"}
                  </p>
                </div>
              </div>
              <details className="mt-3 group">
                <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-[0.14em] text-gold-deep focus-visible:ring-2 focus-visible:ring-gold">
                  How this is calculated
                </summary>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">{summary.formula}</p>
              </details>
              <Link href="/analytics" className="mt-3 inline-block text-xs font-semibold text-navy-700 underline-offset-2 hover:underline">
                Open analytics →
              </Link>
            </>
          ) : can("can_read_analytics") ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <p className="text-sm text-ink-mute">Analytics are available to managers and above.</p>
          )}
        </Card>

        {/* try your own text */}
        <Card ornament className="p-5">
          <SectionHeading title="Try your own text" subtitle="Paste two sentences — the six reviewers read them in seconds" />
          <Field label="Draft copy" htmlFor="try-text" hint="Nothing is published. You can delete the result afterwards.">
            <TextArea
              id="try-text"
              rows={4}
              value={draft}
              placeholder="Our fee-free account is the cheapest on the market — guaranteed."
              onChange={(e) => setDraft(e.target.value)}
            />
          </Field>
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="primary"
              loading={trying}
              disabled={draft.trim().length < 12}
              onClick={async () => {
                setTrying(true);
                try {
                  const created = await api.post<ContentItem>("/content", {
                    title: `Quick check — ${new Date().toLocaleString()}`,
                    content_type: "social_post",
                    text: draft,
                  });
                  router.push(`/content/${created.id}`);
                } catch (err: any) {
                  push(err.message, "error");
                  setTrying(false);
                }
              }}
            >
              Read this draft
            </Button>
            <Sentri mood="scanning" size={40} decorative />
          </div>
        </Card>

        {/* queue */}
        <Card className="p-5">
          <SectionHeading title="Waiting on a human" subtitle="Items in review across your workspace" />
          {!items ? <Skeleton className="h-24 w-full" /> : pending.length === 0 ? (
            <EmptyState
              title="Nothing is waiting for approval"
              body="Once someone submits a draft it appears here for a manager or approver to decide. Load the demo workspace to see the whole loop working."
              action={<LoadDemoButton label="Load demo data" size="sm" />}
            />
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
            <EmptyState
              title="No submissions yet"
              body="Paste a draft on New submission and the six reviewers will read it against the Brand Kit."
              action={<><Link href="/new"><Button size="sm">New submission</Button></Link>
                        <LoadDemoButton label="Load demo data" size="sm" variant="secondary" /></>}
            />
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
                <span aria-hidden="true" className="text-confirmed">✓</span> {line}
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
                  <span className="block h-full rounded-full bg-possible"
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
