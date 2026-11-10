"""LLM evaluation: three real configurations, measured end to end.

    cd backend
    export LLM_PROVIDER=openai LLM_API_KEY=sk-... LLM_MODEL=gpt-4o-mini
    python -m eval.run_llm_eval                 # runs all three configs
    python -m eval.run_llm_eval --configs six_reviewers --limit 10
    python -m eval.run_llm_eval --samples heldout

Configurations (identical samples, identical matching rules, identical seeds):

1. `single_prompt`  — one generic reviewer prompt asks for every issue at once.
                      No per-reviewer job, no brand rules, no citations.
2. `six_reviewers`  — six specialist prompts, one call each, no retrieved rules.
                      Isolates the effect of splitting the job six ways.
3. `full_context`   — the product configuration: six specialists, retrieved rule
                      text and approved facts in the prompt, evidence required.

What is measured per configuration:
    precision / recall / F1 (micro and per reviewer), false-positive rate on
    samples with no seeded mistake, latency p50/p95, prompt + completion tokens,
    estimated cost at the model's published list price, and the number of
    findings produced. Every figure is produced by running the code.

Honesty rules baked in:
    * No key → exits with a clear message and a non-zero status. It never prints
      placeholder or "expected" numbers.
    * Responses are cached on disk by (provider, model, prompt version, config,
      text hash, temperature, seed) so a re-run with the same inputs is free and
      reproducible. `--no-cache` forces fresh calls and is the only way to get new
      latency numbers.
    * Temperature is 0 and a fixed seed is sent where the provider supports one.
    * Figures from this harness are written to `eval/report_llm.{md,json}` and are
      the only LLM numbers allowed to appear in docs or the UI.
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

CACHE_DIR = Path(os.environ.get("SENTINEL_EVAL_CACHE", ".eval-cache"))
SEED = 20260101

# USD per 1M tokens, published list prices used only for the cost estimate.
PRICES = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "claude-3-5-haiku-latest": (0.80, 4.00),
    "claude-sonnet-4": (3.00, 15.00),
}


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
# prompts
# --------------------------------------------------------------------------- #
REVIEWERS = ("brand_voice", "terminology", "fact_checker", "visual", "accessibility", "legal")

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

FULL_CONTEXT_SYSTEM = SPECIALIST_SYSTEM + (
    " The approved brand rules that apply are listed below. Cite the rule id in `rule_key`. "
    "If no approved rule covers what you see, still report it but set rule_key to null — "
    "never invent a rule."
)


def _rules_block(rules: list[dict]) -> str:
    if not rules:
        return "(no rules retrieved)"
    return "\n".join(f"- {r.get('key')}: {r.get('text')}" for r in rules[:12])


# --------------------------------------------------------------------------- #
# running one configuration
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
    """Retrieve the real rule/fact context the product would use for this sample."""
    from app.services.pipeline import active_brand_kit, build_context

    text = sample["text"]
    kit = active_brand_kit(db, org_id)
    ctx, _bundle, _prep = build_context(
        db, org_id=org_id, kit=kit, text=text,
        blocks=[{"id": "b1", "kind": "paragraph", "text": text, "page": 1, "meta": {}}],
        content_type=sample.get("content_type", "blog"), department=sample.get("department"),
    )
    rules = ctx.rules
    return ctx, [
        {"key": r.get("key"), "text": r.get("text")}
        for r in rules
    ]


def run_config(*, adapter, db, org_id: str, samples: list[dict], config: str,
               use_cache: bool, seed: int) -> dict:
    from eval.metrics import evaluate, locate

    latency: list[float] = []
    prompt_tokens = 0
    completion_tokens = 0
    cached_calls = 0
    live_calls = 0
    scored: list[dict] = []

    for sample in samples:
        text = sample["text"]
        predictions: list[dict] = []

        if config == "single_prompt":
            key = _hash(adapter.provider_name, adapter.model_name, "single", text, seed)
            call = _call_model(adapter=adapter, system=SINGLE_SYSTEM,
                               user=SINGLE_USER.format(text=text), cache_key=key,
                               use_cache=use_cache)
            latency.append(call.latency_ms) if not call.cached else None
            cached_calls += int(call.cached)
            live_calls += int(not call.cached)
            prompt_tokens += call.prompt_tokens
            completion_tokens += call.completion_tokens
            for item in _parse_findings(call.raw):
                start, end = locate(text, item.get("span_text", ""))
                predictions.append({"reviewer": item.get("reviewer") or "brand_voice",
                                    "start": start, "end": end})
        else:
            ctx, rules = _context_for(db, org_id, sample)
            for reviewer in REVIEWERS:
                if config == "full_context":
                    system = FULL_CONTEXT_SYSTEM.format(reviewer=reviewer, job=JOBS[reviewer])
                    user = (f"Approved rules:\n{_rules_block(rules)}\n\n"
                            f"<<<CONTENT>>>\n{text}\n<<<END CONTENT>>>\nReturn JSON only.")
                else:
                    system = SPECIALIST_SYSTEM.format(reviewer=reviewer, job=JOBS[reviewer])
                    user = f"<<<CONTENT>>>\n{text}\n<<<END CONTENT>>>\nReturn JSON only."
                key = _hash(adapter.provider_name, adapter.model_name, config, reviewer, text, seed)
                call = _call_model(adapter=adapter, system=system, user=user,
                                   cache_key=key, use_cache=use_cache)
                if call.cached:
                    cached_calls += 1
                else:
                    live_calls += 1
                    latency.append(call.latency_ms)
                prompt_tokens += call.prompt_tokens
                completion_tokens += call.completion_tokens
                for item in _parse_findings(call.raw):
                    start, end = locate(text, item.get("span_text", ""))
                    predictions.append({"reviewer": reviewer, "start": start, "end": end})

        scored.append({
            "id": sample["id"], "text": text,
            "labels": [{"reviewer": r, "type": t, "start": locate(text, span)[0],
                        "end": locate(text, span)[1]}
                       for r, t, span in sample["labels"]],
            "predictions": predictions,
        })

    result = evaluate(scored)
    overall = result["overall"]

    price = PRICES.get(adapter.model_name)
    cost = None
    if price:
        cost = (prompt_tokens / 1_000_000) * price[0] + (completion_tokens / 1_000_000) * price[1]

    return {
        "config": config,
        "samples": len(samples),
        "provider": adapter.provider_name,
        "model": adapter.model_name,
        "seed": seed,
        "temperature": 0.0,
        "metrics": overall,
        "per_reviewer": result["per_reviewer"],
        "misses": {name: m.get("missed", []) for name, m in result["per_reviewer"].items()},
        "latency_ms": {
            "p50": round(statistics.median(latency), 1) if latency else None,
            "p95": round(_p95(latency), 1) if latency else None,
            "calls_measured": len(latency),
        },
        "tokens": {"prompt": prompt_tokens, "completion": completion_tokens,
                   "total": prompt_tokens + completion_tokens},
        "cost_usd_estimate": round(cost, 6) if cost is not None else None,
        "calls": {"live": live_calls, "cached": cached_calls},
        "cost_note": ("list price not in the harness price table; cost left null on purpose"
                      if cost is None else None),
    }


def _p95(values: list[float]) -> float:
    if not values:
        return math.nan
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, math.ceil(0.95 * len(ordered)) - 1))
    return ordered[idx]


def _parse_findings(raw: str) -> list[dict]:
    from app.llm.hosted import HostedLLM

    data = json.loads(HostedLLM._normalise_json(raw) or "{}")
    items = data.get("findings") or data.get("issues") or []
    return [i for i in items if isinstance(i, dict) and i.get("span_text")]


# --------------------------------------------------------------------------- #
# entry point
# --------------------------------------------------------------------------- #
def main() -> int:
    parser = argparse.ArgumentParser(description="LLM evaluation (real calls, real numbers)")
    parser.add_argument("--configs", default="single_prompt,six_reviewers,full_context")
    parser.add_argument("--samples", default="regression", choices=["regression", "heldout", "both"])
    parser.add_argument("--limit", type=int, default=0, help="use only the first N samples")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--json", default="eval/report_llm.json")
    parser.add_argument("--md", default="eval/report_llm.md")
    args = parser.parse_args()

    adapter = _build_adapter()
    if adapter is None:
        print(
            "No hosted LLM is configured, so there is nothing to measure.\n"
            "Set LLM_PROVIDER and LLM_API_KEY (see .env.example) and run again:\n"
            "    export LLM_PROVIDER=openai LLM_API_KEY=... LLM_MODEL=gpt-4o-mini\n"
            "    python -m eval.run_llm_eval\n"
            "This harness refuses to print placeholder numbers: with no key there is no measurement.",
            file=sys.stderr,
        )
        return 2

    from app.db import init_db, session_scope
    from app.models import Organisation
    from seed.brand_kit import ORG
    from seed.samples import SAMPLES

    init_db()
    with session_scope() as db:
        org = db.query(Organisation).filter(Organisation.slug == ORG["slug"]).first()
        if org is None:
            print("No seeded workspace found. Run `python -m seed.seed` first.", file=sys.stderr)
            return 1
        org_id = org.id

    sets: dict[str, list[dict]] = {}
    if args.samples in ("regression", "both"):
        sets["regression"] = SAMPLES
    if args.samples in ("heldout", "both"):
        from seed.heldout_samples import HELDOUT

        sets["heldout"] = HELDOUT
    if args.limit:
        sets = {k: v[: args.limit] for k, v in sets.items()}

    report: dict = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "provider": adapter.provider_name,
        "model": adapter.model_name,
        "seed": SEED,
        "temperature": 0.0,
        "cache": "disabled" if args.no_cache else str(CACHE_DIR),
        "note": ("Latency and tokens are measured per call. Cached calls are excluded from latency "
                 "percentiles and cost is reported for the run that produced them. Use --no-cache to "
                 "benchmark a fresh run."),
        "sets": {},
    }

    for set_name, samples in sets.items():
        report["sets"][set_name] = {}
        for config in [c.strip() for c in args.configs.split(",") if c.strip()]:
            print(f"running {config} on {set_name} ({len(samples)} samples)…", flush=True)
            with session_scope() as db:
                result = run_config(adapter=adapter, db=db, org_id=org_id, samples=samples,
                                    config=config, use_cache=not args.no_cache, seed=SEED)
            m = result["metrics"]
            print(f"  P {m['micro_precision']:.2f}  R {m['micro_recall']:.2f}  "
                  f"F1 {m['micro_f1']:.2f}  FPR {m['mean_false_positive_rate']:.2f}  "
                  f"p95 {result['latency_ms']['p95']} ms  tokens {result['tokens']['total']}")
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
        f"`{report['model']}` · temperature {report['temperature']} · seed {report['seed']}.",
        "",
        report["note"],
        "",
    ]
    for set_name, configs in report["sets"].items():
        title = ("Held-out adversarial set (never used for tuning)"
                 if set_name == "heldout" else "Regression sample set")
        lines += [
            f"## {title}",
            "",
            "| Configuration | Samples | Precision | Recall | F1 | FP rate | p50 ms | p95 ms | Tokens | Cost (USD) |",
            "|---|---|---|---|---|---|---|---|---|---|",
        ]
        for config, r in configs.items():
            m = r["metrics"]
            cost = "—" if r["cost_usd_estimate"] is None else f"${r['cost_usd_estimate']:.4f}"
            lines.append(
                f"| `{config}` | {r['samples']} | {m['micro_precision']:.2f} | {m['micro_recall']:.2f} | "
                f"{m['micro_f1']:.2f} | {m['mean_false_positive_rate']:.2f} | "
                f"{r['latency_ms']['p50'] if r['latency_ms']['p50'] is not None else '—'} | "
                f"{r['latency_ms']['p95'] if r['latency_ms']['p95'] is not None else '—'} | "
                f"{r['tokens']['total']} | {cost} |")
        lines.append("")

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
