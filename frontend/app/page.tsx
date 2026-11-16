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
import { DeskSentri } from "./components/Desk";
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
  brand_health_trend: { week_start: string; brand_score: number | null; submissions: number; findings: number }[];
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

/**
 * A band label between the blocks of the page.
 *
 * The overview is long, and without numbers down the side the eye has no idea
 * where it is. These are the section marks of a printed report: a numeral, a
 * rule, and three words. Nothing here carries information — it is all aria-hidden
 * — because a screen-reader user is navigating by the headings themselves.
 */
function Band({ n, label }: { n: string; label: string }) {
  return (
    <div aria-hidden="true" className="mb-3 mt-8 flex items-center gap-3">
      <span className="font-mono text-[10px] tabular-nums tracking-[0.18em] text-[color:var(--ink-3)]">{n}</span>
      <span className="h-px flex-1 bg-[color:var(--hairline)]" />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-3)]">{label}</span>
    </div>
  );
}

/** The day's masthead: double rule, one line of fact, and the reading that matters. */
function Masthead({
  today, org, firstName, children,
}: {
  today: string; org: string; firstName: string; children: React.ReactNode;
}) {
  return (
    <header className="relative mb-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-2xs uppercase tracking-[0.24em] text-[color:var(--ink-3)]">
          {today}
          <span aria-hidden="true" className="mx-2 text-[color:var(--hairline)]">/</span>
          {org} · desk overview
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-3)]">
          The proof desk · round 3
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        {/* basis- forces the button block onto its own line on a phone, rather than
            squeezing the sentence into a column three words wide */}
        <div className="min-w-0 flex-1 basis-[22rem]">
          <h1 className="font-display text-[2.15rem] font-semibold leading-[0.98] tracking-[-0.038em] text-[color:var(--ink)] sm:text-[3rem]">
            Today at the <span className="em-italic">gate</span>, {firstName}.
          </h1>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-[color:var(--ink-2)]">
            Six specialist reviewers check content against the {org} Brand Kit. Every finding
            explains itself with a rule and a source; you decide what happens next.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {children}
          {/* the owl, on a stamp — the one soft mark on a page of rules */}
          <span
            aria-hidden="true"
            className="relative hidden h-[86px] w-[86px] shrink-0 place-items-center rounded-full border border-dashed border-[color:var(--hairline-strong)] bg-[color:var(--paper)] sm:grid"
          >
            <span className="absolute inset-[5px] rounded-full border border-[color:var(--hairline)]" />
            <DeskSentri size={54} mood="reading" />
          </span>
        </div>
      </div>

      {/* the masthead rule: a thick ink line with a hairline beneath it */}
      <div className="mt-6 border-t-[3px] border-[color:var(--ink)]" />
      <div className="mt-[3px] border-t border-[color:var(--hairline)]" />
    </header>
  );
}

/**
 * One reading on the dial bank.
 *
 * `spark` is the only input that is drawn rather than printed, and it is optional:
 * a cell with no series simply has no line under it, and no cell invents one.
 */
function Dial({
  value, label, sub, spark, tone = "ink",
}: {
  value: string; label: string; sub?: string;
  spark?: number[];
  tone?: "ink" | "mark" | "pass";
}) {
  const tick = tone === "mark" ? "bg-[color:var(--mark)]" : tone === "pass" ? "bg-[color:var(--pass-graphic)]" : "bg-[color:var(--ink)]";
  let path = "";
  if (spark && spark.length > 1) {
    const lo = Math.min(...spark), hi = Math.max(...spark), span = hi - lo || 1;
    path = spark
      .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (spark.length - 1)) * 100},${16 - ((v - lo) / span) * 14}`)
      .join(" ");
  }
  return (
    <div className="group relative px-4 py-4 transition-colors duration-200 hover:bg-[color:var(--paper-2)] sm:px-5 sm:py-5">
      <span aria-hidden="true" className={`mb-2.5 block h-[2px] w-4 ${tick}`} />
      <span className="block font-mono text-[2.15rem] font-semibold leading-none tabular-nums tracking-[-0.02em] text-[color:var(--ink)] sm:text-[2.5rem]">
        {value}
      </span>
      <span className="mt-2 block text-xs font-medium text-[color:var(--ink-2)]">{label}</span>
      {sub && (
        <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-3)]">{sub}</span>
      )}
      {path && (
        <svg viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true"
             className="mt-2 h-4 w-full opacity-70 transition-opacity group-hover:opacity-100">
          <path d={path} fill="none" stroke="var(--ink-3)" strokeWidth="1.2"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}

/** The week label under the chart: "21 Sep". */
function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const SEVERITIES = [
  { key: "critical", label: "Critical", colour: "var(--mark)" },
  { key: "high", label: "High", colour: "var(--warn)" },
  { key: "medium", label: "Medium", colour: "var(--ink-2)" },
  { key: "low", label: "Low", colour: "var(--ink-3)" },
] as const;

const REVIEWER_LABEL: Record<string, string> = {
  brand_voice: "Brand Voice",
  terminology: "Terminology",
  fact_checker: "Fact Checker",
  visual: "Visual",
  accessibility: "Accessibility",
  legal: "Legal",
};

/**
 * Seven weeks of brand health, as the numbers actually recorded.
 *
 * The chart is drawn from `brand_health_trend`; every label on it is computed from
 * that array, so it cannot drift from the data. The same figures are written out in
 * a visually hidden list, so the shape of the line is never the only way to read it.
 */
function TrendCard({ trend }: { trend: Summary["brand_health_trend"] }) {
  const points = trend.filter((w) => typeof w.brand_score === "number");
  if (points.length < 2) {
    return (
      <p className="text-sm text-[color:var(--ink-3)]">
        Not enough weeks recorded yet to draw a trend.
      </p>
    );
  }

  const values = points.map((w) => w.brand_score as number);
  const first = values[0];
  const last = values[values.length - 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  // a small vertical margin so the highest and lowest points are not on the edge
  const y = (v: number) => 6 + (1 - (v - lo) / span) * 48;   // 0..60
  const x = (i: number) => (i / (values.length - 1)) * 100;   // 0..100 %
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L100,60 L0,60 Z`;
  const delta = last - first;
  const newFindings = points[points.length - 1].findings;

  return (
    <>
      <div className="relative mt-1 h-[104px]">
        <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"
             className="h-full w-full overflow-visible">
          {[0, 30, 60].map((gy) => (
            <line key={gy} x1="0" y1={gy} x2="100" y2={gy}
                  stroke="var(--hairline)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill="var(--mark-tint)" />
          <path d={line} fill="none" stroke="var(--ink)" strokeWidth="1.5"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* the current week, marked in HTML so the dot stays round whatever the width */}
        <span aria-hidden="true"
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color:var(--paper)] bg-[color:var(--mark)]"
              style={{ left: "100%", top: `${(y(last) / 60) * 100}%` }} />
      </div>
      <div className="mt-1 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--ink-3)]">
        <span>{weekLabel(points[0].week_start)}</span>
        <span>{weekLabel(points[points.length - 1].week_start)}</span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-2)]">
        Brand score went from{" "}
        <strong className="font-semibold text-[color:var(--ink)]">{first.toFixed(1)}</strong> to{" "}
        <strong className="font-semibold text-[color:var(--ink)]">{last.toFixed(1)}</strong>
        {" "}({delta >= 0 ? "+" : ""}{delta.toFixed(1)}), with{" "}
        <strong className="font-semibold text-[color:var(--ink)]">{newFindings}</strong>{" "}
        finding{newFindings === 1 ? "" : "s"} in the current week.
      </p>

      <ul className="sr-only">
        {points.map((w) => (
          <li key={w.week_start}>
            Week of {weekLabel(w.week_start)}: brand score {w.brand_score}, {w.submissions} submission
            {w.submissions === 1 ? "" : "s"}, {w.findings} finding{w.findings === 1 ? "" : "s"}.
          </li>
        ))}
      </ul>

      <Link href="/analytics"
            className="link-under mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--ink)]">
        The whole record <Icon name="arrow" size={13} />
      </Link>
    </>
  );
}

/**
 * Where the findings come from: severity mix, then the reviewer that raised them.
 * Counts only — no percentages are invented, they are divided by the total shown.
 */
function MixCard({ summary }: { summary: Summary }) {
  const severity = SEVERITIES.map((s) => ({ ...s, count: summary.findings_by_severity[s.key] ?? 0 }));
  const total = severity.reduce((n, s) => n + s.count, 0);
  const reviewers = Object.entries(summary.findings_by_reviewer).sort((a, b) => b[1] - a[1]);
  const busiest = reviewers.length ? reviewers[0][1] : 0;

  if (total === 0) {
    return <p className="text-sm text-[color:var(--ink-3)]">No findings recorded in this window yet.</p>;
  }

  return (
    <>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-[2px] border border-[color:var(--hairline)]"
        role="img"
        aria-label={severity.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")}
      >
        {severity.map((s) => (
          <span key={s.key} style={{ width: `${(s.count / total) * 100}%`, background: s.colour }}
                title={`${s.label}: ${s.count}`} />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {severity.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-[color:var(--ink-2)]">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: s.colour }} />
              {s.label}
            </span>
            <span className="font-mono tabular-nums text-[color:var(--ink)]">{s.count}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-[color:var(--hairline)] pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
        Raised by
      </p>
      <ul className="mt-2 space-y-1.5">
        {reviewers.map(([key, count]) => (
          <li key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_1.75rem] items-center gap-2 text-xs">
            <span className="truncate text-[color:var(--ink-2)]">{REVIEWER_LABEL[key] ?? key}</span>
            <span className="relative block h-[5px] overflow-hidden rounded-[1px] bg-[color:var(--hairline)]">
              <span className="block h-full origin-left rounded-[1px] bg-[color:var(--ink)]"
                    style={{ width: `${busiest ? (count / busiest) * 100 : 0}%` }} />
            </span>
            <span className="text-right font-mono tabular-nums text-[color:var(--ink)]">{count}</span>
          </li>
        ))}
      </ul>
    </>
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
      {/* --------------------------------------------------------- the masthead */}
      <Masthead today={today} org={me?.organisation.name ?? "this workspace"} firstName={firstName ?? "there"}>
        <Link href="/new">
          <Button variant="primary">
            <span className="flex items-center gap-2">
              <Icon name="pen" size={14} /> Review new content
            </span>
          </Button>
        </Link>
      </Masthead>

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
          the eye should read numbers, not boxes. Each cell carries a coloured
          tick so the four can be told apart at a glance, and the brand-score cell
          carries the weekly series itself — the same array the chart below uses,
          so the two can never disagree. */}
      <div className="my-6 grid grid-cols-2 divide-[color:var(--hairline)] border-y-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper)] sm:grid-cols-4 sm:divide-x">
        <Dial
          value={items ? String(pending.length) : "—"}
          label="Waiting on a human"
          sub={pending.length ? "in review now" : "the desk is clear"}
          tone={pending.length ? "mark" : "ink"}
        />
        <Dial value={summary ? String(summary.submissions) : "—"} label="Submissions reviewed" sub="last 90 days" />
        <Dial
          value={summary ? summary.brand_score.toFixed(1) : "—"}
          label="Brand score"
          sub="90-day composite"
          spark={summary?.brand_health_trend.map((w) => w.brand_score ?? 0)}
        />
        <Dial
          value={summary?.average_approval_hours != null ? `${summary.average_approval_hours.toFixed(1)}h` : "—"}
          label="Average approval"
          sub={summary?.average_approval_hours != null ? "draft to decision" : "not measured yet"}
          tone="pass"
        />
      </div>

      <Band n="01" label="The reading" />
      <div className="grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        {/* ------------------------------------------------------ brand score */}
        <Card className="relative overflow-hidden border-[1.5px] border-[color:var(--ink)] p-5">
          {/* a crop mark in the corner, the way a press sheet is trimmed */}
          <span aria-hidden="true" className="absolute right-3 top-3 h-3 w-3 border-r border-t border-[color:var(--ink-3)]" />
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
                      <span className="line-clamp-2 block text-sm font-medium leading-snug text-[color:var(--ink)]">{item.title}</span>
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

        {/* ------------------------------------------------------ my content
            Full width: it is a list, and at a third of the row four of the five
            items were truncated to "Warehouse ad (paid soc…". */}
        <Card className="p-5 lg:col-span-3">
          <SectionHeading title="Your recent submissions" subtitle="Drafts and reviews you own" />
          {!items ? <Skeleton className="h-24 w-full" /> : mine.length === 0 ? (
            items.length === 0 ? (
              /* nothing in the workspace at all: the honest empty state */
              <div className="mx-auto max-w-2xl">
              <EmptyState
                title="No submissions yet"
                body="Paste a draft on New submission and the six reviewers will read it against the Brand Kit."
                action={<><Link href="/new"><Button size="sm">New submission</Button></Link>
                          <LoadDemoButton label="Load demo data" size="sm" variant="secondary" /></>}
              />
              </div>
            ) : (
              /* the workspace has content, this person just does not own any of it —
                 saying "load the demo" here would be wrong, it is already loaded */
              <div className="mx-auto max-w-2xl">
              <EmptyState
                title="Nothing in your name yet"
                body={`The workspace has ${items.length} submissions and none of them are yours. Your team's drafts are in the Content queue, or paste a new draft to review it yourself.`}
                action={<><Link href="/new"><Button size="sm">New submission</Button></Link>
                          <Link href="/content"><Button size="sm" variant="secondary">Content queue</Button></Link></>}
              />
              </div>
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
                      <span className="line-clamp-2 block text-sm font-medium leading-snug text-[color:var(--ink)]">{item.title}</span>
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

      <Band n="02" label="The signal" />
      {/* -------------------------------------------------- the signal strip
          Two readings a manager actually asks for: is it getting better or worse,
          and where is it coming from. Both drawn from the summary already loaded. */}
      <div className="mt-4 grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionHeading
            title="Seven weeks at the gate"
            subtitle="Brand score by week, from the same recorded runs as the figures above"
          />
          {summary ? (
            <TrendCard trend={summary.brand_health_trend} />
          ) : can("can_read_analytics") ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <p className="text-sm text-[color:var(--ink-3)]">Analytics are available to managers and above.</p>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeading title="Where the findings come from" subtitle="Severity, then the reviewer that raised it" />
          {summary ? (
            <MixCard summary={summary} />
          ) : can("can_read_analytics") ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <p className="text-sm text-[color:var(--ink-3)]">Analytics are available to managers and above.</p>
          )}
        </Card>
      </div>

      <Band n="03" label="How it runs" />
      {/* ------------------------------------------------ how a review runs */}
      <div className="mt-4 grid items-start gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionHeading
            title="How a review runs"
            subtitle="Deterministic checks first, then six reviewers in parallel, then de-duplication and confidence scoring."
          />
          <ol className="grid gap-px overflow-hidden rounded-[8px] bg-[color:var(--hairline)] sm:grid-cols-2">
            {[
              ["Extract", "Text blocks and images from pasted text, DOCX, PDF or image uploads."],
              ["Deterministic checks", "Approved and banned terms, colour values, alt text, WCAG contrast — Confirmed findings with a rule ID."],
              ["Retrieve", "Rules, terms and facts filtered to the organisation, plus brand-kit chunks from pgvector."],
              ["Six reviewers", "Brand Voice, Terminology, Fact Checker, Visual, Accessibility, Legal — strict JSON, span-level."],
              ["Merge & score", "Duplicates merged by span overlap; confidence from repeat-run agreement, evidence strength and deterministic backing."],
              ["Human decision", "Accept, edit, dismiss with reason, or escalate. A manager override can become a rule — only after they answer the prompt."],
            ].map(([title, body], i) => (
              <li
                key={title}
                className="group relative flex gap-3 bg-[color:var(--paper)] p-3.5 transition-colors duration-200 hover:bg-[color:var(--highlight-tint)]"
              >
                <span
                  aria-hidden="true"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[color:var(--hairline-strong)] font-mono text-[10px] tabular-nums text-[color:var(--ink)] transition-colors duration-200 group-hover:border-[color:var(--ink)] group-hover:bg-[color:var(--ink)] group-hover:text-[color:var(--paper)]"
                >
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
