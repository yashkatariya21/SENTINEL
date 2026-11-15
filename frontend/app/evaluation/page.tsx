"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, SectionHeading, Skeleton, Tag, useToast } from "../components/ui";
import { DeskSentri } from "../components/Desk";
import { Scene } from "../components/brand/Scenes";

interface Row {
  reviewer: string;
  predicted?: number;
  labelled?: number;
  precision: number;
  recall: number;
  f1: number;
  false_positive_rate: number;
  baseline_precision: number | null;
  baseline_f1: number | null;
  delta_f1: number;
}

interface Block {
  samples: number | null;
  overall: Record<string, number>;
  rows: Row[];
  relaxed: { precision: number; recall: number; f1: number } | null;
  missed: { reviewer: string; sample: string; type: string; span: string }[];
  note: string | null;
  is_heldout: boolean;
  /** "eval/report.json" for a live run, or the recorded copy baked into the build. */
  source?: string | null;
  recorded_at?: string | null;
  provider?: string | null;
  model?: string | null;
}

interface Payload {
  regression: Block | null;
  heldout: Block | null;
  llm: any | null;
  /** the tracked markdown column: measured offline, no key needed */
  llm_markdown: string | null;
  llm_source: string | null;
  llm_configured: boolean;
  can_generate: boolean;
  looked_for: string;
  provenance: Record<string, string>;
  generated: Record<string, string | null>;
}

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;

const when = (iso: string | null | undefined) => {
  if (!iso) return "not recorded";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

/** A recorded copy is a measurement, but not a live one. Say which, every time. */
function SourceLine({ block }: { block: Block }) {
  const snapshot = (block.source || "").includes("snapshot");
  return (
    <p className="mt-2 border-t border-[color:var(--hairline)] pt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
      {snapshot ? (
        <>
          recorded copy · {when(block.recorded_at)} ·{" "}
          <span className="normal-case tracking-normal">bundled at build time; re-run to refresh</span>
        </>
      ) : (
        <>
          {block.source || "eval/report.json"} · measured {when(block.recorded_at)}
          {block.model ? ` · ${block.provider} / ${block.model}` : ""}
        </>
      )}
    </p>
  );
}

export default function EvaluationPage() {
  const { push } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Payload>("/evaluation"));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function rerun() {
    setBusy(true);
    try {
      setData(await api.post<Payload>("/evaluation/run"));
      push("Benchmark re-run. The numbers below are new.", "ok");
    } catch (err: any) {
      push(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Card className="p-6 text-sm text-critical" role="alert">{error}</Card>;
  if (!data) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>;

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-2xs uppercase tracking-[0.24em] text-[color:var(--ink-2)]">Evaluation</p>
          <h1 className="mt-1 text-[1.9rem] font-semibold leading-tight tracking-[-0.03em] text-[color:var(--ink)]">
            What has been measured, and what has not
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Two sets of numbers, deliberately kept apart. The regression set tells you whether a rule change broke
            something. The held-out set tells you whether the engine generalises. They disagree, and that is the
            point.
          </p>
        </div>
        <Button onClick={rerun} loading={busy}>Re-run benchmark</Button>
      </div>

      <Card className="mt-5 border-[color:var(--hairline)] bg-gradient-parchment p-4">
        <div className="flex items-start gap-3">
          <DeskSentri mood="reading" size={52} />
          <p className="text-xs leading-relaxed text-ink-soft">
            <strong className="text-navy">Read this first.</strong> {data.provenance.warning}
          </p>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BenchmarkCard
          title="Pipeline regression benchmark"
          subtitle={
            data.regression?.samples
              ? `Rule-based engine · ${data.regression.samples} labelled samples written alongside the rules`
              : "Rule-based engine · labelled samples written alongside the rules"
          }
          block={data.regression}
          generated={data.generated.regression}
          onGenerate={rerun}
          generating={busy}
          lookedFor={data.looked_for}
        />
        <BenchmarkCard
          title="Held-out adversarial set"
          subtitle={
            data.heldout?.samples
              ? `${data.heldout.samples} samples written after the rules, never used for tuning`
              : "Samples written after the rules, never used for tuning"
          }
          block={data.heldout}
          heldout
          onGenerate={rerun}
          generating={busy}
          lookedFor={data.looked_for}
        />
      </div>

      {/* Confidence bands: the measurement behind "a higher band is more trustworthy" */}
      {data.regression && <ConfidenceBands block={data.regression} />}

      {/* LLM evaluation */}
      <Card className="mt-4 p-5">
        <SectionHeading
          title="LLM evaluation"
          subtitle="Three configurations, real calls, measured latency, tokens and cost"
        />
        {data.llm ? (
          <LLMTable report={data.llm} />
        ) : data.llm_markdown ? (
          <div>
            <p className="mb-2 text-xs leading-relaxed text-ink-soft">
              No hosted model has been measured in this deployment, so no hosted number is shown. What
              follows is the <strong>offline engine’s</strong> column from a recorded run — measured, and
              reproducible without a key.
            </p>
            <pre className="max-h-80 overflow-auto rounded-md border border-[color:var(--hairline)] bg-[color:var(--paper-2)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--ink-2)]">
              {data.llm_markdown}
            </pre>
            <p className="mt-2 font-mono text-2xs uppercase tracking-[0.08em] text-[color:var(--ink-3)]">
              Hosted model measured: no · key configured: {data.llm_configured ? "yes" : "no"}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-ink/20 bg-ivory-deep/50 p-4">
            <p className="text-sm font-semibold text-ink">Not measured in this deployment.</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              The LLM benchmark needs a hosted provider key. With none configured, this section stays empty on
              purpose — Sentinel does not print placeholder or expected scores. To produce these numbers:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-navy px-3 py-2 font-mono text-2xs text-[#FFE066]">
{`export LLM_PROVIDER=openai LLM_API_KEY=... LLM_MODEL=gpt-4o-mini
python -m eval.run_llm_eval            # writes eval/report_llm.{md,json}`}
            </pre>
            <p className="mt-2 text-2xs text-ink-mute">
              Key configured right now: {data.llm_configured ? "yes" : "no"}. Responses are cached by input hash,
              temperature is 0 and a fixed seed is sent.
            </p>
          </div>
        )}
      </Card>

      {/* misses */}
      {data.heldout && data.heldout.missed.length > 0 && (
        <Card className="mt-4 p-5">
          <SectionHeading
            title="What the held-out set caught that we did not"
            subtitle="Every miss, unedited. A demo that only shows wins is a demo, not an evaluation."
          />
          <ul className="space-y-1.5">
            {data.heldout.missed.slice(0, 20).map((miss, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2 border-b border-ink/5 pb-1.5 text-xs">
                <span className="font-mono text-2xs text-ink-mute">{miss.sample}</span>
                <Tag>{miss.reviewer.replace("_", " ")}</Tag>
                <span className="text-ink-soft">{miss.type.replace(/_/g, " ")}</span>
                <span className="italic text-ink">“{miss.span}”</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4 p-5">
        <SectionHeading title="How each number is produced" subtitle="Same matching rules everywhere" />
        <ul className="space-y-1.5 text-xs leading-relaxed text-ink-soft">
          <li>
            <strong>True positive:</strong> the reviewer name matches <em>and</em> the predicted span overlaps the
            hand-labelled span (IoU ≥ 0.3). Each label is matched once.
          </li>
          <li>
            <strong>Relaxed score:</strong> the same overlap rule without the reviewer-name requirement — it shows
            how often the right text was found by the wrong lens.
          </li>
          <li>
            <strong>False-positive rate:</strong> sample-level — the share of samples with no seeded mistake for
            that reviewer that still received a finding.
          </li>
          <li>
            <strong>Cost and latency:</strong> measured per call by the harness, not modelled. Cached responses are
            excluded from latency percentiles.
          </li>
          <li>
            <strong>Not measured here:</strong> human-agreement studies, production traffic, or performance with
            your own Brand Kit. {data.provenance.regression}
          </li>
        </ul>
      </Card>
    </div>
  );
}

/**
 * Confidence bands — the measurement behind the claim that a higher band is better.
 *
 * If medium and high are tied, the card says so instead of implying a ranking. On this
 * data they are tied, so the copy is fixed rather than flattering.
 */
function ConfidenceBands({ block }: { block: Block }) {
  const bands = (block as any).bands || {};
  const rows = ["low", "medium", "high"]
    .map((name) => ({ name, ...(bands[name] || {}) }))
    .filter((row) => typeof row.predicted === "number");
  if (rows.length === 0) return null;

  const tied = rows.length === 3 && bands.medium?.precision === bands.high?.precision;
  const nonMonotonic = rows.some((row, i) => i > 0 && row.precision < rows[i - 1].precision);

  return (
    <Card className="mt-4 p-5">
      <SectionHeading
        title="Does a higher confidence band mean a more accurate finding?"
        subtitle="Measured on the labelled set: how often each band was right. This is the only evidence behind the confidence score."
      />
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Precision by confidence band on the labelled set</caption>
        <thead>
          <tr className="text-2xs uppercase tracking-[0.1em] text-ink-mute">
            <th scope="col" className="py-1 font-medium">Band</th>
            <th scope="col" className="py-1 text-right font-medium">Findings</th>
            <th scope="col" className="py-1 text-right font-medium">Matched a label</th>
            <th scope="col" className="py-1 text-right font-medium">Precision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-ink/10">
              <th scope="row" className="py-1 font-mono text-2xs uppercase tracking-[0.08em] text-ink-soft">{row.name}</th>
              <td className="py-1 text-right tabular-nums text-ink-soft">{row.predicted}</td>
              <td className="py-1 text-right tabular-nums text-ink-soft">{row.matched}</td>
              <td className="py-1 text-right font-semibold tabular-nums text-ink">{pct(row.precision)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        {nonMonotonic
          ? "Precision does not rise with the band on this sample, so the band is a sort order only — not a probability."
          : tied
            ? "Precision never falls as the band rises, but medium and high are tied here, so the difference between them is not established. The band is a defensible sort order; it is not a calibrated probability."
            : "Precision rises with the band on this sample, and that ordering is all it claims to be."}
      </p>
    </Card>
  );
}

function BenchmarkCard({
  title, subtitle, block, generated, heldout = false, onGenerate, generating, lookedFor,
}: {
  title: string; subtitle: string; block: Block | null; generated?: string | null;
  heldout?: boolean; onGenerate?: () => void; generating?: boolean; lookedFor?: string;
}) {
  if (!block) {
    /* The old empty state told the reader to go and run a command. A screen that can
       measure the thing itself should offer to, and say exactly what it looked for. */
    return (
      <Card className="p-5">
        <SectionHeading title={title} subtitle={subtitle} />
        <Scene name="evaluation" height={110} className="mb-3" />
        <div className="rounded-md border border-dashed border-ink/20 bg-ivory-deep/50 p-4">
          <p className="text-sm font-semibold text-ink">Nothing has been measured here yet.</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Sentinel looked for <code className="font-mono text-2xs">{lookedFor || "eval/report.json"}</code> and
            found neither that file nor the recorded copy bundled with this build. It will not show a
            placeholder in its place.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onGenerate} loading={generating}>
              Measure it now
            </Button>
            <span className="text-2xs text-ink-mute">
              Runs the offline engine over the labelled set — about ten seconds, no API key.
            </span>
          </div>
          <p className="mt-2 font-mono text-[10px] text-ink-mute">
            or, on a machine with the repo: <code>cd backend &amp;&amp; python -m eval.run_eval</code>
          </p>
        </div>
      </Card>
    );
  }
  const overall = block.overall as any;
  return (
    <Card className="p-5">
      <SectionHeading title={title} subtitle={subtitle} />
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["Precision", overall.predicted === 0 ? "—" : pct(overall.micro_precision)],
          ["Recall", pct(overall.micro_recall)],
          ["F1", pct(overall.micro_f1)],
          ["FP rate", pct(overall.mean_false_positive_rate)],
        ].map(([label, value]) => (
          <div key={label as string} className="border-l-[1.5px] border-[color:var(--hairline-strong)] bg-[color:var(--paper-2)] px-2 py-2">
            <p className="font-mono text-xl font-semibold tabular-nums text-[color:var(--ink)]">{value}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-3)]">{label}</p>
          </div>
        ))}
      </div>

      {heldout && block.relaxed && (
        <p className="mt-2 rounded-md border border-[color:var(--hairline)] bg-[color:var(--paper-2)] px-2.5 py-1.5 text-2xs text-[color:var(--ink-2)]">
          Relaxed (any reviewer, span covered): P {pct(block.relaxed.precision)} · R{" "}
          {pct(block.relaxed.recall)} · F1 {pct(block.relaxed.f1)} — the gap between the two rows is the
          “right problem, wrong lens” rate.
        </p>
      )}

      <SourceLine block={block} />

      <table className="mt-3 w-full text-left text-xs">
        <thead>
          <tr className="text-2xs uppercase tracking-[0.1em] text-ink-mute">
            <th scope="col" className="py-1 font-medium">Reviewer</th>
            <th scope="col" className="py-1 text-right font-medium">P</th>
            <th scope="col" className="py-1 text-right font-medium">R</th>
            <th scope="col" className="py-1 text-right font-medium">F1</th>
            <th scope="col" className="py-1 text-right font-medium">FPR</th>
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.reviewer} className="border-t border-ink/8">
              <td className="py-1 text-ink-soft">
                {row.reviewer.replace("_", " ")}
                {row.labelled !== undefined && (
                  <span className="ml-1 font-mono text-[10px] text-ink-mute">
                    {row.predicted}/{row.labelled}
                  </span>
                )}
              </td>
              <td className="py-1 text-right font-mono text-2xs"
                  title={row.predicted === 0 ? "this reviewer produced no findings on this set" : undefined}>
                {row.predicted === 0 ? "—" : row.precision.toFixed(2)}
              </td>
              <td className="py-1 text-right font-mono text-2xs">{row.recall.toFixed(2)}</td>
              <td className="py-1 text-right font-mono text-2xs">{row.f1.toFixed(2)}</td>
              <td className="py-1 text-right font-mono text-2xs">{row.false_positive_rate.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 font-mono text-2xs text-ink-mute">
        {block.samples ?? 0} samples{generated ? ` · generated ${generated.slice(0, 10)}` : ""} · per-reviewer
        “predicted/labelled” shown next to each name; “—” means the reviewer produced nothing to score
      </p>
      {block.note && <p className="mt-1 text-2xs leading-relaxed text-ink-mute">{block.note}</p>}
    </Card>
  );
}

function LLMTable({ report }: { report: any }) {
  const sets = report.sets ?? {};
  return (
    <div className="space-y-4">
      {Object.entries(sets).map(([setName, configs]: [string, any]) => (
        <div key={setName}>
          <p className="font-mono text-2xs uppercase tracking-[0.16em] text-[color:var(--ink-2)]">
            {setName === "heldout" ? "held-out set" : "regression set"} · {report.model}
          </p>
          <table className="mt-1 w-full text-left text-xs">
            <thead>
              <tr className="text-2xs uppercase tracking-[0.1em] text-ink-mute">
                <th scope="col" className="py-1 font-medium">Configuration</th>
                <th scope="col" className="py-1 text-right font-medium">P</th>
                <th scope="col" className="py-1 text-right font-medium">R</th>
                <th scope="col" className="py-1 text-right font-medium">F1</th>
                <th scope="col" className="py-1 text-right font-medium">p95 ms</th>
                <th scope="col" className="py-1 text-right font-medium">Tokens</th>
                <th scope="col" className="py-1 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(configs).map(([config, r]: [string, any]) => (
                <tr key={config} className="border-t border-ink/8">
                  <td className="py-1 font-mono text-2xs text-ink-soft">{config}</td>
                  <td className="py-1 text-right font-mono text-2xs">{r.metrics.micro_precision.toFixed(2)}</td>
                  <td className="py-1 text-right font-mono text-2xs">{r.metrics.micro_recall.toFixed(2)}</td>
                  <td className="py-1 text-right font-mono text-2xs">{r.metrics.micro_f1.toFixed(2)}</td>
                  <td className="py-1 text-right font-mono text-2xs">{r.latency_ms.p95 ?? "—"}</td>
                  <td className="py-1 text-right font-mono text-2xs">{r.tokens.total}</td>
                  <td className="py-1 text-right font-mono text-2xs">
                    {r.cost_usd_estimate === null ? "—" : `$${r.cost_usd_estimate.toFixed(4)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="font-mono text-2xs text-ink-mute">
        generated {String(report.generated_at ?? "").slice(0, 19).replace("T", " ")} · seed {report.seed} ·
        temperature {report.temperature}
      </p>
    </div>
  );
}
