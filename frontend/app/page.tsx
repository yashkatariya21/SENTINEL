"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ContentItem, Finding, isNoBrandKit, readableError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Button, Card, EmptyState, Field, SectionHeading, Skeleton, StatusPill, Tag, TextArea, useToast,
} from "./components/ui";
import { LoadDemoButton } from "./components/Demo";
import { BrandScoreRing } from "./components/brand/BrandScoreRing";
import { DeskSentri, Figure } from "./components/Desk";
import { Icon } from "./components/Icon";

/** What `GET /brand-kits/{id}/health` reports, narrowed to what the checklist needs. */
interface Readiness {
  hasKit: boolean;
  checks: { item: string; ok: boolean }[];
  counts: { rules: number };
}

const CHECKLIST_KEY = "sentinel.overview.checklist";

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

/**
 * The getting-started checklist.
 *
 * Shown only while there is something to start: no kit, no confirmed rules, no draft, or
 * no decision yet. Every tick comes from the readiness endpoint or from data the overview
 * already loaded, so a completed step is never claimed before it happened. Dismissible,
 * and the dismissal is remembered on this machine — a reader who knows the product should
 * not have to sweep it away on every visit.
 */
function GettingStarted({
  readiness, hasDraft, decisionMade, onDismiss,
}: {
  readiness: Readiness;
  hasDraft: boolean;
  decisionMade: boolean;
  onDismiss: () => void;
}) {
  const rulesConfirmed = (readiness.counts?.rules ?? 0) > 0;
  const steps = [
    {
      key: "kit",
      label: "Set up a Brand Kit",
      body: readiness.hasKit
        ? "A kit exists. Load the sample standards, or upload your own guideline."
        : "There is no kit yet, so nothing can be checked against your standards.",
      done: readiness.hasKit,
      href: "/kit",
      cta: "Open the Brand Kit",
    },
    {
      key: "rules",
      label: "Confirm some rules",
      body: "Extracted rules stay in draft until an Admin confirms them. Until one is confirmed, a review is limited to built-in checks.",
      done: rulesConfirmed,
      href: "/kit",
      cta: "Confirm rules",
    },
    {
      key: "draft",
      label: "Send the first draft",
      body: "Paste text or upload a DOCX, PDF or image. Six reviewers read it against the kit.",
      done: hasDraft,
      href: "/new",
      cta: "Review new content",
    },
    {
      key: "decision",
      label: "Make the first decision",
      body: "Accept, edit, dismiss or escalate a finding. That decision is what the learning loop remembers.",
      done: decisionMade,
      href: hasDraft ? "/content" : "/new",
      cta: hasDraft ? "Open the queue" : "Start with a draft",
    },
  ];
  const remaining = steps.filter((step) => !step.done).length;
  if (remaining === 0) return null;

  return (
    <section
      aria-labelledby="getting-started-title"
      className="mb-6 rounded-[10px] border-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--hairline)] px-4 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-3)]">
            Getting started · {steps.length - remaining} of {steps.length} done
          </p>
          <h2 id="getting-started-title" className="mt-0.5 text-sm font-semibold text-[color:var(--ink)]">
            Four steps from an empty workspace to a decided review
          </h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-[4px] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-3)] transition-colors hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
        >
          Dismiss
        </button>
      </div>
      <ol className="divide-y divide-[color:var(--hairline)]">
        {steps.map((step, i) => (
          <li key={step.key} className="flex items-start gap-3 px-4 py-2.5">
            <span
              aria-hidden="true"
              className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full border font-mono text-[10px] tabular-nums ${
                step.done
                  ? "border-[color:var(--pass-graphic)] bg-[color:var(--pass-tint)] text-[color:var(--pass)]"
                  : "border-[color:var(--hairline-strong)] text-[color:var(--ink-3)]"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>
            {/* Below `sm` the action stacks under the sentence instead of competing with
                it for width: a 390px screen gives the button ~110px, which left the copy
                about six characters wide and wrapped it one word to a line. */}
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${step.done ? "text-[color:var(--ink-3)] line-through decoration-[color:var(--pass-graphic)]" : "text-[color:var(--ink)]"}`}>
                  {step.label}
                  <span className="sr-only">{step.done ? " — done" : " — not done yet"}</span>
                </p>
                {!step.done && (
                  <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ink-2)]">{step.body}</p>
                )}
              </div>
              {!step.done && (
                <Link
                  href={step.href}
                  className="flex-none self-start whitespace-nowrap rounded-[5px] border border-[color:var(--hairline-strong)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink)] transition-colors hover:bg-[color:var(--ink)] hover:text-[color:var(--paper)] sm:mt-0.5"
                >
                  {step.cta}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
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
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [decisionMade, setDecisionMade] = useState(false);
  const [checklistHidden, setChecklistHidden] = useState(true);

  useEffect(() => {
    api.get<ContentItem[]>("/content").then(setItems).catch((e) => setError(readableError(e)));
    if (can("can_read_analytics")) {
      api.get<Summary>("/analytics/summary").then(setSummary).catch(() => setSummary(null));
    }
  }, [can]);

  /* The getting-started checklist is driven by the readiness endpoint the Brand Kit page
     already uses (`GET /brand-kits/{id}/health`), plus two facts the overview has anyway:
     whether anything has been written, and whether any finding has been decided. Nothing
     here is inferred from a spinner or a guess. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const kits = await api.get<{ id: string; status: string }[]>("/brand-kits");
        const kit = kits.find((k) => k.status === "active") ?? kits[0];
        if (!alive) return;
        if (!kit) {
          setReadiness({ hasKit: false, checks: [], counts: { rules: 0 } });
          return;
        }
        const health = await api.get<{
          checks: { item: string; ok: boolean }[];
          counts: { rules: number };
        }>(`/brand-kits/${kit.id}/health`);
        if (alive) setReadiness({ hasKit: true, checks: health.checks, counts: health.counts });
      } catch {
        if (alive) setReadiness(null);
      }
    })();
    api
      .get<Finding[]>("/findings")
      .then((rows) => alive && setDecisionMade(rows.some((f) => f.decision_status !== "open")))
      .catch(() => undefined);
    try {
      setChecklistHidden(window.localStorage.getItem(CHECKLIST_KEY) === "hidden");
    } catch {
      setChecklistHidden(false);
    }
    return () => {
      alive = false;
    };
  }, []);

  const pending = (items || []).filter((i) => i.status === "in_review");
  const mine = (items || []).filter((i) => i.owner_id === me?.user.id);
  const firstName = me?.user.name.split(" ")[0];

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div>
      {/* ------------------------------------------------------ the desk head */}
      <div className="mb-6 border-b-[1.5px] border-[color:var(--hairline-strong)] pb-5">
        <p className="font-mono text-2xs uppercase tracking-[0.24em] text-[color:var(--ink-3)]">
          {today} <span className="mx-2 text-[color:var(--hairline)]">/</span> {me?.organisation.name} · desk overview
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[2rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[color:var(--ink)] sm:text-[2.5rem]">
              Today at the gate, {firstName}.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[color:var(--ink-2)]">
              Six specialist reviewers check content against the {me?.organisation.name} Brand Kit. Every finding
              explains itself with a rule and a source; you decide what happens next.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/new">
              <Button variant="primary">
                <span className="flex items-center gap-2">
                  <Icon name="pen" size={14} /> Review new content
                </span>
              </Button>
            </Link>
            <span className="hidden text-[color:var(--ink-2)] sm:block">
              <DeskSentri size={64} mood="idle" />
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-[8px] border border-[color:var(--mark)] bg-[color:var(--mark-tint)] px-3 py-2 text-sm text-[color:var(--mark-text)]">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      {readiness && !checklistHidden && (
        <GettingStarted
          readiness={readiness}
          hasDraft={(items || []).length > 0}
          decisionMade={decisionMade}
          onDismiss={() => {
            setChecklistHidden(true);
            try {
              window.localStorage.setItem(CHECKLIST_KEY, "hidden");
            } catch {
              /* private mode: it simply comes back next visit */
            }
          }}
        />
      )}

      {/* ----------------------------------------------- the instrument strip
          Four readings, divided by hairlines like a bank of dials. No cards:
          the eye should read numbers, not boxes. */}
      <div className="mb-6 grid grid-cols-2 divide-[color:var(--hairline)] border-y border-[color:var(--hairline)] bg-[color:var(--paper)] sm:grid-cols-4 sm:divide-x">
        <Figure value={items ? String(pending.length) : "—"} label="Waiting on a human" sub={pending.length ? "in review now" : "the desk is clear"} />
        <Figure value={summary ? String(summary.submissions) : "—"} label="Submissions reviewed" sub="last 90 days" />
        <Figure
          value={summary ? summary.brand_score.toFixed(1) : "—"}
          label="Brand score"
          sub="90-day composite"
        />
        <Figure
          value={summary?.average_approval_hours != null ? `${summary.average_approval_hours.toFixed(1)}h` : "—"}
          label="Average approval"
          sub={summary?.average_approval_hours != null ? "draft to decision" : "not measured yet"}
        />
      </div>

      <div className="grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        {/* ------------------------------------------------------ brand score */}
        <Card className="relative overflow-hidden p-5">
          <SectionHeading title="Brand Score" subtitle="Last 90 days across the workspace" />
          {summary ? (
            <>
              <div className="flex items-center gap-4">
                <BrandScoreRing value={summary.brand_score} size={104} />
                <div>
                  <p className="font-mono text-2xl font-semibold tabular-nums text-[color:var(--ink)]">
                    {summary.submissions}{" "}
                    <span className="font-sans text-sm font-normal text-[color:var(--ink-3)]">submissions reviewed</span>
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--ink-2)]">
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[color:var(--mark)]" />
                      {summary.findings_by_severity.critical ?? 0} critical
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[color:var(--warn)]" />
                      {summary.findings_by_severity.high ?? 0} high
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--ink-3)]">
                    Average approval {summary.average_approval_hours != null
                      ? `${summary.average_approval_hours.toFixed(1)} h`
                      : "not measured yet"}
                  </p>
                </div>
              </div>
              <details className="group mt-4">
                <summary className="cursor-pointer list-none font-mono text-2xs uppercase tracking-[0.14em] text-[color:var(--ink-2)] transition-colors hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="chevron" size={12} className="transition-transform group-open:rotate-90" />
                    How this is calculated
                  </span>
                </summary>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[color:var(--ink-3)]">{summary.formula}</p>
              </details>
              <Link
                href="/analytics"
                className="link-under mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--ink)]"
              >
                Open analytics <Icon name="arrow" size={13} />
              </Link>
            </>
          ) : can("can_read_analytics") ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <p className="text-sm text-[color:var(--ink-3)]">Analytics are available to managers and above.</p>
          )}
        </Card>

        {/* -------------------------------------------------- try your own text */}
        <Card ornament className="p-5">
          <SectionHeading title="Try your own text" subtitle="Paste two sentences — the six reviewers read them in seconds" />
          <Field label="Draft copy" htmlFor="try-text" hint="Nothing is published. You can delete the result afterwards.">
            <TextArea
              id="try-text"
              rows={4}
              value={draft}
              placeholder="Our fee-free account is the cheapest on the market — guaranteed."
              onChange={(e) => setDraft(e.target.value)}
              className="font-doc !text-[15px] !leading-[1.7]"
            />
          </Field>
          <div className="mt-3 flex items-center justify-between gap-2">
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
                } catch (err: unknown) {
                  if (isNoBrandKit(err)) {
                    push("This workspace has no Brand Kit yet — set one up first.", "error");
                    router.push("/kit");
                  } else {
                    push(readableError(err, "That draft could not be read."), "error");
                  }
                  setTrying(false);
                }
              }}
            >
              Read this draft
            </Button>
            <span className="text-[color:var(--ink-2)]">
              <DeskSentri mood={trying ? "reading" : "idle"} size={40} />
            </span>
          </div>
        </Card>

        {/* ------------------------------------------------------ the queue */}
        <Card className="p-5">
          <SectionHeading title="Waiting on a human" subtitle="Items in review across your workspace" />
          {!items ? <Skeleton className="h-24 w-full" /> : pending.length === 0 ? (
            <EmptyState
              title="Nothing is waiting for approval"
              body={items.length === 0
                ? "Once someone submits a draft it appears here for a manager or approver to decide. Load the demo workspace to see the whole loop working."
                : "Every submission in this workspace has been decided. New drafts land here the moment someone submits one."}
              action={items.length === 0 ? <LoadDemoButton label="Load demo data" size="sm" /> : undefined}
            />
          ) : (
            <ul className="divide-y divide-[color:var(--hairline)]">
              {pending.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/content/${item.id}/approval`}
                    className="group flex items-center justify-between gap-2 py-2.5 transition-colors hover:bg-[color:var(--highlight-tint)]"
                  >
                    <span className="min-w-0 pl-1">
                      <span className="block truncate text-sm font-medium text-[color:var(--ink)]">{item.title}</span>
                      <span className="text-xs text-[color:var(--ink-3)]">{item.owner_name} · {item.department}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 pr-1">
                      <StatusPill status={item.status} />
                      <Icon name="arrow" size={13} className="text-[color:var(--ink-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--ink)]" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ------------------------------------------------------ my content */}
        <Card className="p-5">
          <SectionHeading title="Your recent submissions" subtitle="Drafts and reviews you own" />
          {!items ? <Skeleton className="h-24 w-full" /> : mine.length === 0 ? (
            items.length === 0 ? (
              /* nothing in the workspace at all: the honest empty state */
              <EmptyState
                title="No submissions yet"
                body="Paste a draft on New submission and the six reviewers will read it against the Brand Kit."
                action={<><Link href="/new"><Button size="sm">New submission</Button></Link>
                          <LoadDemoButton label="Load demo data" size="sm" variant="secondary" /></>}
              />
            ) : (
              /* the workspace has content, this person just does not own any of it —
                 saying "load the demo" here would be wrong, it is already loaded */
              <EmptyState
                title="Nothing in your name yet"
                body={`The workspace has ${items.length} submissions and none of them are yours. Your team's drafts are in the Content queue, or paste a new draft to review it yourself.`}
                action={<><Link href="/new"><Button size="sm">New submission</Button></Link>
                          <Link href="/content"><Button size="sm" variant="secondary">Content queue</Button></Link></>}
              />
            )
          ) : (
            <ul className="divide-y divide-[color:var(--hairline)]">
              {mine.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/content/${item.id}`}
                    className="group flex items-center justify-between gap-2 py-2.5 transition-colors hover:bg-[color:var(--highlight-tint)]"
                  >
                    <span className="min-w-0 pl-1">
                      <span className="block truncate text-sm font-medium text-[color:var(--ink)]">{item.title}</span>
                      <span className="text-xs text-[color:var(--ink-3)]">{item.content_type.replace("_", " ")} · v{item.current_version}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 pr-1">
                      <StatusPill status={item.status} />
                      <Icon name="arrow" size={13} className="text-[color:var(--ink-3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--ink)]" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------ how a review runs */}
      <div className="mt-4 grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionHeading
            title="How a review runs"
            subtitle="Deterministic checks first, then six reviewers in parallel, then de-duplication and confidence scoring."
          />
          <ol className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ["Extract", "Text blocks and images from pasted text, DOCX, PDF or image uploads."],
              ["Deterministic checks", "Approved and banned terms, colour values, alt text, WCAG contrast — Confirmed findings with a rule ID."],
              ["Retrieve", "Rules, terms and facts filtered to the organisation, plus brand-kit chunks from pgvector."],
              ["Six reviewers", "Brand Voice, Terminology, Fact Checker, Visual, Accessibility, Legal — strict JSON, span-level."],
              ["Merge & score", "Duplicates merged by span overlap; confidence from repeat-run agreement, evidence strength and deterministic backing."],
              ["Human decision", "Accept, edit, dismiss with reason, or escalate. A manager override can become a rule — only after they answer the prompt."],
            ].map(([title, body], i) => (
              <li key={title} className="group flex gap-3 border-l border-[color:var(--hairline)] pl-3 transition-colors hover:border-[color:var(--mark)]">
                <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-[color:var(--ink-3)] transition-colors group-hover:text-[color:var(--mark-text)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <p className="font-mono text-2xs uppercase tracking-[0.14em] text-[color:var(--ink)]">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[color:var(--ink-2)]">{body}</p>
                </span>
              </li>
            ))}
          </ol>
        </Card>

        {/* ----------------------------------------------------------- guardrails */}
        <div className="relative overflow-hidden rounded-[10px] border-[1.5px] border-[#111318] bg-[#111318] p-5 text-[#F4F5F7]">
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.1]">
            <defs>
              <pattern id="gr-rules" width="18" height="18" patternUnits="userSpaceOnUse">
                <path d="M0 18H18" fill="none" stroke="#9AA1AE" strokeWidth="0.7" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#gr-rules)" />
          </svg>
          <div className="relative">
            <p className="font-mono text-2xs uppercase tracking-[0.2em] text-[#9AA1AE]">House rules</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Guardrails</h2>
            <p className="mt-1 text-xs text-[#9AA1AE]">Design constraints, not settings</p>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                "Never publishes content.",
                "Never auto-fixes: a suggestion may only change the flagged span.",
                "Never changes a rule without a manager's click.",
                "Legal and accessibility rules need an Approver.",
                "Nobody approves their own item.",
                "Submitted content is data, never instructions.",
              ].map((line) => (
                <li key={line} className="flex gap-2 text-[#C3CAD6]">
                  <span aria-hidden="true" className="mt-0.5 shrink-0 text-[#7BE0A8]">
                    <Icon name="check" size={14} />
                  </span>
                  <span className="text-xs leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
            {summary && (
              <p className="mt-4 border-t border-[#3A4149] pt-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.1em] text-[#6C7683]">
                AI provider <span className="text-[#FFE066]">{summary.provider.provider}</span> · model{" "}
                <span className="text-[#C3CAD6]">{summary.provider.model}</span> · prompt{" "}
                <span className="text-[#C3CAD6]">{summary.provider.prompt_version}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {summary && summary.most_common_mistakes.length > 0 && (
        <Card className="mt-4 p-5">
          <SectionHeading title="Most common mistakes" subtitle="Where the team keeps drifting from the Brand Kit" />
          <ul className="space-y-2.5">
            {summary.most_common_mistakes.slice(0, 5).map((m) => (
              <li key={m.rule_key} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-baseline gap-x-3 gap-y-1 text-sm">
                <Tag>{m.rule_key}</Tag>
                <span className="min-w-0">
                  <span className="relative block h-[6px] overflow-hidden rounded-[1px] bg-[color:var(--hairline)]">
                    <span
                      className="block h-full origin-left rounded-[1px] bg-[color:var(--ink)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                      style={{ width: `${Math.min(100, (m.count / Math.max(1, summary.most_common_mistakes[0].count)) * 100)}%` }}
                    />
                  </span>
                  <span className="mt-1 block truncate text-xs leading-relaxed text-[color:var(--ink-3)]">
                    {m.example_issue}
                  </span>
                </span>
                <span className="text-right font-mono text-xs tabular-nums text-[color:var(--ink-2)]">{m.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
