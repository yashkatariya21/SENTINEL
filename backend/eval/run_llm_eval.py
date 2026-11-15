"""LLM evaluation: four real configurations, measured end to end.

    cd backend
    # free path — Ollama, no key, no spend:
    export LLM_PROVIDER=openai_compatible
    export LLM_BASE_URL=http://localhost:11434/v1
    export LLM_API_KEY=ollama            # any non-empty string; Ollama ignores it
    export LLM_MODEL=llama3.1:8b
    python -m eval.run_llm_eval

    python -m eval.run_llm_eval --configs full_context --samples heldout --limit 10
    python -m eval.run_llm_eval --samples blind --configs full_context,offline_engine
    python -m eval.run_llm_eval --configs offline_engine     # no key needed at all

Configurations (identical samples, identical matching rules, identical seeds):

1. `full_context`        — **the shipped path.** The product's own prompt
                           (`HostedLLM.build_prompt`), its own ReviewContext with the
                           retrieved rules, approved facts and evidence chunks, its
                           own JSON parser, repeat runs, and its own `merge_findings`.
                           The only substitution is a disk cache in front of the
                           HTTP call, so a re-run is free and reproducible.
2. `specialists_no_rules` — six specialist prompts, one call each, no retrieved
                           rules and no citations. Isolates what the rule context and
                           the citation requirement contribute.
3. `offline_engine`      — the deterministic engine through `analyse_text`, i.e. the
                           product with no model at all. The free floor.
4. `single_prompt`       — one generic prompt asking for every issue at once. The
                           shape most teams ship first. Not enabled by default.

What is measured per configuration:
    precision / recall / F1 (micro and per reviewer), false-positive rate on samples
    with no seeded mistake, precision per confidence band, latency p50/p95, prompt
    and completion tokens, cost with its basis, the number of provider calls used,
    and the exact model name that produced the answers.

Honesty rules baked in:
    * No hosted adapter and a hosted config was asked for → exits non-zero with a
      clear message. It never prints placeholder or "expected" numbers.
    * Responses are cached on disk by (provider, model, config, reviewer, text,
      temperature, seed) so a re-run with the same inputs is free. `--no-cache`
      forces fresh calls and is the only way to get new latency numbers.
    * Cost is 0.00 with `cost_basis: "unpriced"` for a free or local model — never
      null, and never a guess. Prices come from `app/llm/pricing.py`, the single
      table the pipeline also uses.
    * The blind set (`--samples blind`) is run by hand for the final report and never
      in CI.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from app.llm.pricing import PRICES  # single shared price table

CACHE_DIR = Path(os.environ.get("SENTINEL_EVAL_CACHE", ".eval-cache"))
SEED = 20260101
REVIEWERS = ("brand_voice", "terminology", "visual", "legal", "fact_checker", "accessibility")
HOSTED_CONFIGS = ("full_context", "specialists_no_rules", "single_prompt")
DEFAULT_CONFIGS = "full_context,specialists_no_rules,offline_engine"


def _hash(*parts: object) -> str:
    h = hashlib.sha256()
    for part in parts:
        h.update(str(part).encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()[:32]


@dataclass
class Call:
    latency_ms: float
    prompt_tokens: int
    completion_tokens: int
    cached: bool
    raw: str


def _call_model(*, adapter, system: str, user: str, cache_key: str, use_cache: bool) -> Call:
    """One chat call, cached on disk. Never invents a result when the call fails."""
    CACHE_DIR.mkdir(exist_ok=True)
    path = CACHE_DIR / f"{cache_key}.json"
    if use_cache and path.exists():
        blob = json.loads(path.read_text())
        return Call(0.0, 0, 0, True, blob["raw"])

    started = time.perf_counter()
    before = (getattr(adapter, "prompt_tokens", 0), getattr(adapter, "completion_tokens", 0))
    raw = adapter._chat(system, user)  # the adapter is the only AI touchpoint
    latency = (time.perf_counter() - started) * 1000
    after = (getattr(adapter, "prompt_tokens", 0), getattr(adapter, "completion_tokens", 0))
    prompt_tokens = max(0, after[0] - before[0])
    completion_tokens = max(0, after[1] - before[1])
    path.write_text(json.dumps({"raw": raw, "latency_ms": latency,
                                "prompt_tokens": prompt_tokens,
                                "completion_tokens": completion_tokens}))
    return Call(latency, prompt_tokens, completion_tokens, False, raw)


# --------------------------------------------------------------------------- #
# prompts for the non-shipped configurations
# --------------------------------------------------------------------------- #
JOBS = {
    "brand_voice": "tone, banned words, tone drift from the brand voice",
    "terminology": "approved terms, deprecated names, wrong capitalisation of product names",
    "fact_checker": "numbers, dates and claims that need an approved source",
    "visual": "colour values, logo lockups, image metadata problems",
    "accessibility": "alt text, link text, heading order, colour contrast in the copy",
    "legal": "guarantees, superlatives, regulated claims and legal risk",
}

SINGLE_SYSTEM = (
    "You are a content reviewer. Read the content and list every problem you can find. "
    "Return JSON: {\"findings\": [{\"reviewer\": one of "
    + ", ".join(REVIEWERS)
    + ", \"span_text\": exact substring, \"issue\": short, \"why\": one sentence}]}. "
    "Only quote spans that appear verbatim in the content."
)

SINGLE_USER = "<<<CONTENT>>>\n{text}\n<<<END CONTENT>>>\nReturn JSON only."

SPECIALIST_SYSTEM = (
    "You are the {reviewer} reviewer for a brand governance tool. Your job is {job}. "
    "Report only problems of your kind. For every finding quote the exact span from the "
    "content. Return JSON: {{\"findings\": [{{\"span_text\": exact substring, "
    "\"issue\": short, \"why\": one sentence}}]}}. If nothing is wrong, return "
    "{{\"findings\": []}}."
)


# --------------------------------------------------------------------------- #
def _build_adapter():
    from app.config import settings
    from app.llm.factory import get_adapter

    provider = (settings.llm_provider or "local").lower()
    if provider == "local" or not settings.llm_api_key:
        return None
    adapter = get_adapter()
    if getattr(adapter, "provider_name", "local") == "local":
        return None
    return adapter


def _context_for(db, org_id: str, sample: dict):
    """The real ReviewContext the product would build for this sample."""
    from app.services.pipeline import active_brand_kit, build_context

    text = sample["text"]
    kit = active_brand_kit(db, org_id)
    ctx, _bundle, prep = build_context(
        db, org_id=org_id, kit=kit, text=text,
        blocks=[{"id": "b1", "kind": "paragraph", "text": text, "page": 1, "meta": {}}],
        content_type=sample.get("content_type", "blog"), department=sample.get("department"),
    )
    return ctx, prep


def _scored(sample: dict, predictions: list[dict]) -> dict:
    from eval.metrics import locate

    text = sample["text"]
    return {
        "id": sample["id"], "text": text,
        "labels": [{"reviewer": r, "type": t, "start": locate(text, span)[0],
                    "end": locate(text, span)[1]} for r, t, span in sample["labels"]],
        "predictions": predictions,
    }


def _recommendation(merged: list[dict]) -> list[dict]:
    return [{"reviewer": f["reviewer"], "start": f["span_start"], "end": f["span_end"],
             "confidence": f.get("confidence"), "confidence_band": f.get("confidence_band")}
            for f in merged]


# --------------------------------------------------------------------------- #
# the four configurations
# --------------------------------------------------------------------------- #
def _run_full_context(*, adapter, db, org_id: str, samples: list[dict], repeat_runs: int,
                      use_cache: bool, seed: int, meter: dict) -> list[dict]:
    """The shipped path, with a disk cache in front of the HTTP call."""
    from app.llm.base import ProviderLimitReached
    from app.services.pipeline import (candidate_rows, deterministic_candidates,
                                       merge_findings)

    scored: list[dict] = []
    for sample in samples:
        ctx, prep = _context_for(db, org_id, sample)
        candidates = deterministic_candidates(prep, prep["rules"])
        for run_index in range(repeat_runs):
            for reviewer in REVIEWERS:
                system, user = adapter.build_prompt(reviewer, ctx)  # the product's prompt
                key = _hash(adapter.provider_name, adapter.model_name, "full_context",
                            reviewer, sample["text"], run_index, seed)
                try:
                    call = _call_model(adapter=adapter, system=system, user=user,
                                       cache_key=key, use_cache=use_cache)
                except ProviderLimitReached as exc:
                    meter["stopped"] = str(exc)
                    return scored
                if call.cached:
                    meter["cached"] += 1
                else:
                    meter["live"] += 1
                    meter["latency"].append(call.latency_ms)
                meter["prompt_tokens"] += call.prompt_tokens
                meter["completion_tokens"] += call.completion_tokens
                out = adapter._parse(reviewer, call.raw)  # the product's parser
                if out is None:
                    meter["invalid_json"] += 1
                    continue
                candidates += candidate_rows(out, ctx, run_index=run_index, engine=adapter,
                                             latency_ms=call.latency_ms,
                                             prompt_tokens=call.prompt_tokens,
                                             completion_tokens=call.completion_tokens)
        merged = merge_findings(sample["text"], candidates, repeat_runs)  # the product's merge
        scored.append(_scored(sample, _recommendation(merged)))
    return scored


def _run_specialists_no_rules(*, adapter, db, org_id: str, samples: list[dict],
                              use_cache: bool, seed: int, meter: dict) -> list[dict]:
    """Six specialist prompts with no rules and no citations — the A/B control."""
    from app.llm.base import ProviderLimitReached
    from eval.metrics import locate

    scored: list[dict] = []
    for sample in samples:
        text = sample["text"]
        predictions: list[dict] = []
        for reviewer in REVIEWERS:
            system = SPECIALIST_SYSTEM.format(reviewer=reviewer, job=JOBS[reviewer])
            user = f"<<<CONTENT>>>\n{text}\n<<<END CONTENT>>>\nReturn JSON only."
            key = _hash(adapter.provider_name, adapter.model_name, "specialists_no_rules",
                        reviewer, text, seed)
            try:
                call = _call_model(adapter=adapter, system=system, user=user,
                                   cache_key=key, use_cache=use_cache)
            except ProviderLimitReached as exc:
                meter["stopped"] = str(exc)
                return scored
            if call.cached:
                meter["cached"] += 1
            else:
                meter["live"] += 1
                meter["latency"].append(call.latency_ms)
            meter["prompt_tokens"] += call.prompt_tokens
            meter["completion_tokens"] += call.completion_tokens
            for item in _parse_findings(call.raw, meter):
                start, end = locate(text, item.get("span_text", ""))
                predictions.append({"reviewer": reviewer, "start": start, "end": end})
        scored.append(_scored(sample, predictions))
    return scored


def _run_single_prompt(*, adapter, db, org_id: str, samples: list[dict],
                       use_cache: bool, seed: int, meter: dict) -> list[dict]:
    from app.llm.base import ProviderLimitReached
    from eval.metrics import locate

    scored: list[dict] = []
    for sample in samples:
        text = sample["text"]
        key = _hash(adapter.provider_name, adapter.model_name, "single", text, seed)
        try:
            call = _call_model(adapter=adapter, system=SINGLE_SYSTEM,
                               user=SINGLE_USER.format(text=text), cache_key=key,
                               use_cache=use_cache)
        except ProviderLimitReached as exc:
            meter["stopped"] = str(exc)
            return scored
        if call.cached:
            meter["cached"] += 1
        else:
            meter["live"] += 1
            meter["latency"].append(call.latency_ms)
        meter["prompt_tokens"] += call.prompt_tokens
        meter["completion_tokens"] += call.completion_tokens
        predictions = []
        for item in _parse_findings(call.raw, meter):
            start, end = locate(text, item.get("span_text", ""))
            predictions.append({"reviewer": item.get("reviewer") or "brand_voice",
                                "start": start, "end": end})
        scored.append(_scored(sample, predictions))
    return scored


def _run_offline_engine(*, db, org_id: str, samples: list[dict], repeat_runs: int,
                        meter: dict) -> list[dict]:
    """The deterministic engine through the product's own `analyse_text`."""
    from app.services.pipeline import analyse_text

    scored: list[dict] = []
    for sample in samples:
        text = sample["text"]
        started = time.perf_counter()
        merged, _prep, _meta = analyse_text(
            db, org_id=org_id, text=text,
            blocks=[{"id": "b1", "kind": "paragraph", "text": text, "page": 1, "meta": {}}],
            content_type=sample.get("content_type", "blog"),
            department=sample.get("department"), repeat_runs=repeat_runs,
            honour_exceptions=False,
        )
        meter["latency"].append((time.perf_counter() - started) * 1000)
        meter["samples"] += 1
        scored.append(_scored(sample, _recommendation(merged)))
    return scored


CONFIG_RUNNERS = {
    "full_context": _run_full_context,
    "specialists_no_rules": _run_specialists_no_rules,
    "single_prompt": _run_single_prompt,
}


def run_config(*, adapter, db, org_id: str, samples: list[dict], config: str,
               use_cache: bool, seed: int, repeat_runs: int) -> dict:
    from app.llm.pricing import cost_usd
    from eval.metrics import confidence_bands, evaluate

    meter = {"latency": [], "prompt_tokens": 0, "completion_tokens": 0, "cached": 0,
             "live": 0, "invalid_json": 0, "samples": 0, "stopped": None}

    if config == "offline_engine":
        scored = _run_offline_engine(db=db, org_id=org_id, samples=samples,
                                     repeat_runs=repeat_runs, meter=meter)
        provider, model = "local", "sentinel-local-1"
        basis = "deterministic"
        cost = 0.0
    else:
        runner = CONFIG_RUNNERS.get(config)
        if runner is None:
            raise SystemExit(f"unknown config {config!r}; choose from "
                             f"{', '.join(sorted(CONFIG_RUNNERS) + ['offline_engine'])}")
        scored = runner(adapter=adapter, db=db, org_id=org_id, samples=samples,
                        repeat_runs=repeat_runs, use_cache=use_cache, seed=seed, meter=meter)
        provider, model = adapter.provider_name, adapter.model_name
        cost, basis = cost_usd(model, meter["prompt_tokens"], meter["completion_tokens"])

    result = evaluate(scored)
    overall = result["overall"]
    latency = meter["latency"]

    return {
        "config": config,
        "samples": len(scored),
        "measured_samples": len(scored),
        "provider": provider,
        "model": model,                      # exact model name, everywhere
        "seed": seed,
        "temperature": 0.0,
        "repeat_runs": repeat_runs,
        "metrics": overall,
        "per_reviewer": result["per_reviewer"],
        "confidence_bands": confidence_bands(scored),
        "misses": {name: m.get("missed", []) for name, m in result["per_reviewer"].items()},
        "latency_ms": {
            "p50": round(statistics.median(latency), 1) if latency else None,
            "p95": round(_p95(latency), 1) if latency else None,
            "calls_measured": len(latency),
        },
        "tokens": {"prompt": meter["prompt_tokens"], "completion": meter["completion_tokens"],
                   "total": meter["prompt_tokens"] + meter["completion_tokens"]},
        "cost_usd_estimate": round(cost, 6),
        "cost_basis": basis,
        "calls": {"live": meter["live"], "cached": meter["cached"],
                  "total": meter["live"] + meter["cached"]},
        "invalid_json": meter["invalid_json"],
        "stopped_early": meter["stopped"],
        "cost_note": ("free / unpriced model: cost is 0.00 by definition, not an estimate"
                      if basis == "unpriced" else None),
    }


def _p95(values: list[float]) -> float:
    if not values:
        return math.nan
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, math.ceil(0.95 * len(ordered)) - 1))
    return ordered[idx]


def _parse_findings(raw: str, meter: dict | None = None) -> list[dict]:
    from app.llm.hosted import HostedLLM

    try:
        data = json.loads(HostedLLM._normalise_json(raw) or "{}")
    except (json.JSONDecodeError, TypeError):
        if meter is not None:
            meter["invalid_json"] += 1
        return []
    items = data.get("findings") or data.get("issues") or []
    return [i for i in items if isinstance(i, dict) and i.get("span_text")]


# --------------------------------------------------------------------------- #
def _load_sets(which: str, limit: int) -> dict[str, list[dict]]:
    sets: dict[str, list[dict]] = {}
    if which in ("regression", "both"):
        from seed.samples import SAMPLES

        sets["regression"] = SAMPLES
    if which in ("heldout", "both"):
        from seed.heldout_samples import HELDOUT

        sets["heldout"] = HELDOUT
    if which == "blind" or which == "blind_only":
        from seed.blind_samples import BLIND

        sets["blind"] = BLIND
    if limit:
        sets = {k: v[:limit] for k, v in sets.items()}
    return sets


def main() -> int:
    parser = argparse.ArgumentParser(description="LLM evaluation (real calls, real numbers)")
    parser.add_argument("--configs", default=DEFAULT_CONFIGS)
    parser.add_argument("--samples", default="regression",
                        choices=["regression", "heldout", "both", "blind"])
    parser.add_argument("--limit", type=int, default=0, help="use only the first N samples")
    parser.add_argument("--repeat", type=int, default=0,
                        help="repeat runs for agreement (default: LLM_REPEAT_RUNS)")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--json", default="eval/report_llm.json")
    parser.add_argument("--md", default="eval/report_llm.md")
    args = parser.parse_args()

    configs = [c.strip() for c in args.configs.split(",") if c.strip()]
    needs_hosted = any(c in HOSTED_CONFIGS for c in configs)
    adapter = _build_adapter()
    if adapter is None and needs_hosted:
        print(
            "No hosted LLM is configured, so there is nothing to measure.\n"
            "Any OpenAI-compatible endpoint works, including a free local one:\n"
            "    export LLM_PROVIDER=openai_compatible\n"
            "    export LLM_BASE_URL=http://localhost:11434/v1\n"
            "    export LLM_API_KEY=ollama LLM_MODEL=llama3.1:8b\n"
            "    python -m eval.run_llm_eval\n"
            "The offline engine needs no key at all:\n"
            "    python -m eval.run_llm_eval --configs offline_engine\n"
            "This harness refuses to print placeholder numbers: with no key there is no "
            "measurement.",
            file=sys.stderr,
        )
        return 2

    from app.config import settings
    from app.db import init_db, session_scope
    from app.models import Organisation
    from seed.brand_kit import ORG

    repeat_runs = max(1, args.repeat or settings.llm_repeat_runs)

    init_db()
    with session_scope() as db:
        org = db.query(Organisation).filter(Organisation.slug == ORG["slug"]).first()
        if org is None:
            print("No seeded workspace found. Run `python -m seed.seed` first.", file=sys.stderr)
            return 1
        org_id = org.id

    sets = _load_sets(args.samples, args.limit)
    if not sets:
        print(f"no samples selected for --samples {args.samples}", file=sys.stderr)
        return 1

    report: dict = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "provider": adapter.provider_name if adapter else "local",
        "model": adapter.model_name if adapter else "sentinel-local-1",
        "embedding_mode": "offline" if settings.embedding_is_offline else "provider",
        "repeat_runs": repeat_runs,
        "seed": SEED,
        "temperature": 0.0,
        "cache": "disabled" if args.no_cache else str(CACHE_DIR),
        "configs": configs,
        "note": ("Latency and tokens are measured per call. Cached calls are excluded from latency "
                 "percentiles. Cost is 0.00 with basis 'unpriced' for a free or local model. "
                 "`full_context` uses the shipped prompt, parser and merge step; only the HTTP "
                 "call is cached."),
        "sets": {},
    }

    for set_name, samples in sets.items():
        report["sets"][set_name] = {}
        for config in configs:
            print(f"running {config} on {set_name} ({len(samples)} samples, "
                  f"{repeat_runs} repeat run(s))…", flush=True)
            with session_scope() as db:
                result = run_config(adapter=adapter, db=db, org_id=org_id, samples=samples,
                                    config=config, use_cache=not args.no_cache, seed=SEED,
                                    repeat_runs=repeat_runs)
            m = result["metrics"]
            print(f"  P {m['micro_precision']:.2f}  R {m['micro_recall']:.2f}  "
                  f"F1 {m['micro_f1']:.2f}  FPR {m['mean_false_positive_rate']:.2f}  "
                  f"p95 {result['latency_ms']['p95']} ms  "
                  f"calls {result['calls']['total']}  model {result['model']}")
            if result["stopped_early"]:
                print(f"  STOPPED EARLY: {result['stopped_early']}")
            report["sets"][set_name][config] = result

    Path(args.json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps(report, indent=2, default=str))
    Path(args.md).write_text(to_markdown(report))
    print(f"\nwrote {args.json} and {args.md}")
    return 0


def to_markdown(report: dict) -> str:
    lines = [
        "# Sentinel AI — LLM evaluation",
        "",
        f"Generated {report['generated_at']} · provider `{report['provider']}` · model "
        f"`{report['model']}` · embeddings {report.get('embedding_mode', 'offline')} · "
        f"temperature {report['temperature']} · seed {report['seed']} · "
        f"{report.get('repeat_runs', 1)} repeat run(s).",
        "",
        report["note"],
        "",
    ]
    for set_name, configs in report["sets"].items():
        title = {
            "heldout": "Held-out adversarial set (never used for tuning)",
            "blind": "Blind set (written after the engine changes, scored once)",
        }.get(set_name, "Regression sample set")
        lines += [
            f"## {title}",
            "",
            "| Configuration | Model | Samples | Precision | Recall | F1 | FP rate | p50 ms | p95 ms | Calls | Cost (USD) |",
            "|---|---|---|---|---|---|---|---|---|---|---|",
        ]
        for config, r in configs.items():
            m = r["metrics"]
            cost = f"${r['cost_usd_estimate']:.4f}"
            if r.get("cost_basis") == "unpriced":
                cost += " (free)"
            lines.append(
                f"| `{config}` | `{r['model']}` | {r['samples']} | {m['micro_precision']:.2f} | "
                f"{m['micro_recall']:.2f} | {m['micro_f1']:.2f} | "
                f"{m['mean_false_positive_rate']:.2f} | "
                f"{r['latency_ms']['p50'] if r['latency_ms']['p50'] is not None else '—'} | "
                f"{r['latency_ms']['p95'] if r['latency_ms']['p95'] is not None else '—'} | "
                f"{r['calls']['total']} | {cost} |")
        lines.append("")

        bands = {c: r.get("confidence_bands") for c, r in configs.items() if r.get("confidence_bands")}
        if bands:
            lines += ["### Precision by confidence band", "",
                      "| Configuration | low | medium | high | Monotonic |", "|---|---|---|---|---|"]
            for config, band in bands.items():
                cells = []
                for name in ("low", "medium", "high"):
                    row = band.get(name) or {}
                    cells.append("—" if row.get("precision") is None
                                 else f"{row['precision']:.2f} ({row.get('predicted', 0)})")
                lines.append(f"| `{config}` | {' | '.join(cells)} | "
                             f"{'yes' if band.get('monotonic') else 'no'} |")
            lines += ["", bands[next(iter(bands))].get("note", ""), ""]

        misses = [(config, name, miss)
                  for config, r in configs.items()
                  for name, items in r["misses"].items() for miss in items]
        if misses:
            lines += ["### Misses (first 12)", ""]
            for config, reviewer, miss in misses[:12]:
                lines.append(f"- `{config}` · {reviewer} · `{miss['sample']}` "
                             f"{miss.get('type', '')}: “{miss.get('span', '')}”")
            lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
