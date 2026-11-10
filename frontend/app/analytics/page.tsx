"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, EmptyState, SectionHeading, SeverityChip, Skeleton, Tag } from "../components/ui";
import { Sentri } from "../components/brand/Sentri";
import { ReviewerAvatar } from "../components/brand/ReviewerAvatar";
import { characterFor } from "../components/brand/characters";
import { usePrefs } from "@/lib/prefs";
import { BrandScoreRing } from "../components/brand/BrandScoreRing";

interface Summary {
  brand_score: number;
  formula: string;
  window_days: number;
  submissions: number;
  findings_by_severity: Record<string, number>;
  findings_by_reviewer: Record<string, number>;
  most_common_mistakes: { rule_key: string; count: number; weight: number; share: number; example_issue: string }[];
  department_compliance: { department: string; submissions: number; compliance: number }[];
  average_approval_hours: number | null;
  repeated_violations: { rule_key: string; content_items: number; findings: number }[];
  brand_health_trend: { week_start: string; brand_score: number | null; submissions: number; findings: number }[];
  top_violated_guideline: { rule_key: string; count: number; title: string; share: number } | null;
  monthly_report: any;
  confidence_calibration: {
    band: string; findings: number; decided: number; agreed: number; disagreed: number;
    agreement_rate: number | null; mean_confidence: number | null;
  }[];
  insights: { kind: string; text: string; evidence: Record<string, unknown> }[];
  telemetry: {
    runs_measured: number; mean_wall_ms: number | null; slowest_wall_ms: number | null;
    prompt_tokens: number; completion_tokens: number; cost_usd_estimate: number | null;
    provider?: string; note?: string;
  };
  inputs?: Record<string, number>;
  provider: { provider: string; model: string; prompt_version: string };
}

export default function AnalyticsPage() {
  const { showCharacters } = usePrefs();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Summary>("/analytics/summary").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Card className="p-6 text-sm text-critical" role="alert">{error}</Card>;
  if (!data) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;

  const inputs = data.inputs ?? {};

  const trendPoints = data.brand_health_trend.filter((t) => t.brand_score !== null);
  const maxFindings = Math.max(1, ...Object.values(data.findings_by_severity));

  return (
    <div>
      <p className="font-mono text-2xs uppercase tracking-[0.24em] text-gold-deep">Analytics</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-navy">
        What the reviews actually show
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        Brand health across the last {data.window_days} days. Every number comes from recorded findings plus human
        decisions — there are no targets, benchmarks or forecasts in this page.
      </p>

      {/* insight lines, derived server-side from this workspace's own numbers */}
      <Card className="mt-4 border-gold/40 bg-gradient-parchment p-4">
        <div className="flex items-start gap-3">
          {showCharacters && <Sentri mood="thinking" size={56} decorative />}
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-navy">What changed, and why</h2>
            {data.insights.length === 0 ? (
              <p className="mt-1 text-sm text-ink-soft">Not enough decisions yet to state anything.</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {data.insights.map((insight, i) => (
                  <li key={`${insight.kind}-${i}`} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
                    <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    <span>{insight.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 font-mono text-2xs uppercase tracking-[0.14em] text-ink-mute">
              Derived from {data.inputs?.analysed_submissions ?? 0} analysed submissions · recomputed on every load
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionHeading title="Brand Score" subtitle="Weighted from three measured rates" />
          <div className="flex items-center gap-4">
            <BrandScoreRing value={data.brand_score} size={96} />
            <dl className="min-w-0 flex-1 space-y-1 text-xs text-ink-soft">
            <div className="flex justify-between"><dt>Severity index</dt><dd>{inputs.severity_index ?? '—'}</dd></div>
            <div className="flex justify-between"><dt>Compliance rate</dt><dd>{inputs.compliance_rate ?? '—'}</dd></div>
            <div className="flex justify-between"><dt>Approval rate</dt><dd>{inputs.approval_rate ?? '—'}</dd></div>
            <div className="flex justify-between"><dt>Weighted findings</dt><dd>{inputs.weighted_findings ?? '—'}</dd></div>
            <div className="flex justify-between"><dt>Analysed submissions</dt><dd>{inputs.analysed_submissions ?? '—'}</dd></div>
            </dl>
          </div>
          <details className="mt-3 rounded-md border border-ink/12 bg-ivory-deep/70 p-2">
            <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-[0.14em] text-gold-deep">Show the formula</summary>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{data.formula}</p>
          </details>
        </Card>

        <Card className="p-5">
          <SectionHeading title="Findings by severity" subtitle="Weighted counts across all runs" />
          <ul className="space-y-2">
            {(["critical", "high", "medium", "low"] as const).map((sev) => {
              const n = data.findings_by_severity[sev] || 0;
              return (
                <li key={sev} className="flex items-center gap-2 text-sm">
                  <span className="w-24"><SeverityChip severity={sev} /></span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                    <span className="block h-full rounded-full bg-navy-500" style={{ width: `${(n / maxFindings) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right text-xs text-ink-mute">{n}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 border-t border-ink/10 pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-mute">By reviewer</p>
            <ul className="grid grid-cols-2 gap-1 text-xs text-ink-soft">
              {Object.entries(data.findings_by_reviewer).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {showCharacters && <ReviewerAvatar reviewer={k} size={18} showRing={false} />}
                    <span className="truncate text-ink-soft">{showCharacters ? characterFor(k).name : k.replace("_", " ")}</span>
                  </span>
                  <span className="font-mono text-2xs text-ink-mute">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading title="Brand health trend" subtitle="Weekly score, last 8 weeks" />
          {trendPoints.length < 2 ? (
            <EmptyState title="Not enough history yet" body="Two or more weeks of reviews are needed for a trend." />
          ) : (
            <TrendChart points={data.brand_health_trend} />
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-ink-mute">Average approval time</p>
              <p className="text-lg font-semibold text-ink">
                {data.average_approval_hours === null ? "—" : `${data.average_approval_hours.toFixed(1)} h`}
              </p>
            </div>
            <div>
              <p className="text-ink-mute">Top violated guideline</p>
              <p className="text-sm font-medium text-ink">
                {data.top_violated_guideline ? `${data.top_violated_guideline.rule_key} (${data.top_violated_guideline.count})` : "—"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeading title="Confidence calibration"
                           subtitle="Did humans agree more often when Sentinel was confident? Computed from accepted, edited and dismissed decisions." />
          <CalibrationChart bands={data.confidence_calibration} />
        </Card>

        <Card className="p-5">
          <SectionHeading title="Most common mistakes"
                           subtitle="Ranked by weighted severity (low 1, medium 2, high 4, critical 8), so a guarantee outweighs four nits." />
          {data.most_common_mistakes.length === 0 ? <EmptyState title="No findings recorded yet" /> : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink-mute">
                  <th scope="col" className="py-1 font-medium">Rule</th>
                  <th scope="col" className="py-1 font-medium">What keeps happening</th>
                  <th scope="col" className="py-1 text-right font-medium">Count</th>
                  <th scope="col" className="py-1 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.most_common_mistakes.map((m) => (
                  <tr key={m.rule_key} className="border-t border-ink/5">
                    <td className="py-1.5 pr-2"><Tag tone="navy">{m.rule_key}</Tag></td>
                    <td className="py-1.5 pr-2 text-ink-soft">{m.example_issue}</td>
                    <td className="py-1.5 text-right">{m.count}
                      <span className="ml-1 text-[10px] text-ink-mute" title="weighted severity score">
                        (w{m.weight ?? m.count})
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-ink-mute">{Math.round(m.share * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeading title="Department compliance" subtitle="Share of submissions with no open high or critical finding" />
          <ul className="space-y-2">
            {data.department_compliance.map((d) => (
              <li key={d.department} className="text-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-soft">{d.department} <span className="text-ink-mute">({d.submissions})</span></span>
                  <span className="text-ink-mute">{Math.round(d.compliance * 100)}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
                  <div className={`h-full rounded-full ${d.compliance >= 0.8 ? "bg-confirmed" : d.compliance >= 0.5 ? "bg-possible" : "bg-critical"}`}
                       style={{ width: `${Math.max(4, d.compliance * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeading title="Repeated violations" subtitle="Same rule broken on more than one item — a training problem, not a wording problem" />
          {data.repeated_violations.length === 0 ? <EmptyState title="No repeats" /> : (
            <ul className="space-y-1.5 text-sm">
              {data.repeated_violations.map((r) => (
                <li key={r.rule_key} className="flex items-center justify-between gap-2 border-b border-ink/5 pb-1.5">
                  <Tag tone="navy">{r.rule_key}</Tag>
                  <span className="text-xs text-ink-soft">{r.content_items} items · {r.findings} findings</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeading title="Cost and latency"
                           subtitle="Measured per run by the pipeline, not modelled" />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-ink-mute">Runs measured</dt>
              <dd className="font-display text-xl font-semibold text-navy">{data.telemetry?.runs_measured ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-mute">Mean run wall time</dt>
              <dd className="font-display text-xl font-semibold text-navy">
                {data.telemetry?.mean_wall_ms != null ? `${Math.round(data.telemetry.mean_wall_ms)} ms` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-mute">Slowest run</dt>
              <dd className="text-sm text-ink-soft">
                {data.telemetry?.slowest_wall_ms != null ? `${Math.round(data.telemetry.slowest_wall_ms)} ms` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-mute">Tokens (prompt + completion)</dt>
              <dd className="text-sm text-ink-soft">
                {data.telemetry?.prompt_tokens || data.telemetry?.completion_tokens
                  ? `${data.telemetry?.prompt_tokens ?? 0} + ${data.telemetry?.completion_tokens ?? 0}`
                  : "none — offline engine"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-mute">Estimated cost</dt>
              <dd className="text-sm text-ink-soft">
                {data.telemetry?.cost_usd_estimate != null
                  ? `$${data.telemetry.cost_usd_estimate.toFixed(4)}`
                  : data.telemetry?.provider === "local" ? "£0 — no model calls" : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-mute">Provider</dt>
              <dd className="font-mono text-2xs text-ink-soft">{data.telemetry?.provider ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-2 border-t border-ink/10 pt-2 text-2xs leading-relaxed text-ink-mute">
            {data.telemetry?.note}
          </p>
        </Card>

        <Card className="p-5">
          <SectionHeading title="Monthly report"
                           subtitle={data.monthly_report?.month ? `Month of ${data.monthly_report.month}` : "This month"} />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Submissions analysed", data.monthly_report?.submissions_analysed],
              ["Findings", data.monthly_report?.findings],
              ["High or critical", data.monthly_report?.high_or_critical],
              ["Dismissed by managers", data.monthly_report?.findings_dismissed_by_managers],
              ["Approvals", data.monthly_report?.approvals],
              ["Rejections", data.monthly_report?.rejections],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-xs text-ink-mute">{label}</dt>
                <dd className="text-lg font-semibold text-ink">{value as number ?? 0}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 border-t border-ink/10 pt-2 text-[11px] text-ink-mute">
            Provider {data.provider.provider} · model {data.provider.model} · prompt {data.provider.prompt_version}
          </p>
        </Card>
      </div>
    </div>
  );
}

function TrendChart({ points }: { points: Summary["brand_health_trend"] }) {
  const width = 320;
  const height = 110;
  const values = points.map((p) => p.brand_score);
  const known = values.filter((v): v is number => v !== null);
  const min = Math.max(0, Math.min(...known) - 5);
  const max = Math.min(100, Math.max(...known) + 5);
  const span = Math.max(1, max - min);
  const step = width / Math.max(1, points.length - 1);
  const xy = points.map((p, i) => {
    const value = p.brand_score === null ? null : p.brand_score;
    return value === null ? null : [i * step, height - ((value - min) / span) * height] as [number, number];
  });
  const path = xy.filter(Boolean).map((pt, i) => `${i === 0 ? "M" : "L"}${pt![0].toFixed(1)},${pt![1].toFixed(1)}`).join(" ");

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img"
           aria-label={`Brand score trend: ${points.map((p) => `${p.week_start}: ${p.brand_score ?? "no data"}`).join(", ")}`}>
        <line x1="0" y1={height} x2={width} y2={height} stroke="#E3D9C4" strokeWidth="1" />
        <path d={path} fill="none" stroke="#8F7418" strokeWidth="2.4" strokeLinejoin="round" />
        {xy.map((pt, i) => pt && (
          <circle key={i} cx={pt[0]} cy={pt[1]} r="3" fill="#C9A227" />
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] text-ink-mute">
        <span>{points[0]?.week_start}</span>
        <span>{points[points.length - 1]?.week_start}</span>
      </figcaption>
    </figure>
  );
}


function CalibrationChart({ bands }: { bands: Summary["confidence_calibration"] }) {
  const decidedBands = bands.filter((b) => b.decided > 0);
  if (decidedBands.length === 0) {
    return (
      <EmptyState
        title="No decisions yet"
        body="Calibration needs humans to accept, edit or dismiss findings. Until then there is nothing to compare — and Sentinel will not guess."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {bands.map((b) => {
        const pct = b.agreement_rate === null ? null : Math.round(b.agreement_rate * 100);
        return (
          <li key={b.band}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold uppercase tracking-[0.12em] text-ink-soft">{b.band} confidence</span>
              <span className="text-ink-mute">
                {pct === null ? "no decisions yet" : `${pct}% agreed`}
                <span className="ml-1.5 font-mono text-2xs">({b.decided} of {b.findings} decided)</span>
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-ink/10" role="img"
                 aria-label={pct === null
                   ? `${b.band} confidence: no decisions yet`
                   : `${b.band} confidence: humans agreed ${pct} percent of ${b.decided} decisions`}>
              {pct !== null && (
                <div className="h-full rounded-full bg-gradient-gold transition-[width] duration-500 ease-royal motion-reduce:transition-none"
                     style={{ width: `${Math.max(4, pct)}%` }} />
              )}
            </div>
          </li>
        );
      })}
      <li className="border-t border-ink/10 pt-2 text-2xs leading-relaxed text-ink-mute">
        “Agreed” means a manager accepted or edited the finding. A dismissal counts as disagreement. Findings with
        no decision are excluded from the rate.
      </li>
    </ul>
  );
}
