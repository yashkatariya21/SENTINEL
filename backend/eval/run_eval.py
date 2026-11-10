"""Pipeline regression benchmark (rule-based engine).

This scores the shipped deterministic rule engine plus the local reviewer adapter
against 53 hand-labelled samples. It answers one question: *did a code or rule
change break something?* It is **not** a measurement of LLM quality — for that,
run `eval/run_llm_eval.py`, which needs an API key and reports its own numbers.

The samples were written alongside the rules, and the pattern lists are shared
between them, so treat these figures as regression numbers, not generalisation.

Usage (from backend/):
    python -m eval.run_eval               # score the shipped labelled set
    python -m eval.run_eval --repeat 3    # include repeat-run agreement
    python -m eval.run_eval --json out.json --md out.md

Reports precision, recall, F1 and false-positive rate per reviewer, plus the
same numbers for a single-prompt baseline, and writes a markdown report.
"""
from __future__ import annotations

import argparse
import json
import logging
import os

from app.db import init_db, session_scope
from app.models import Organisation
from seed.brand_kit import ORG
from seed.samples import SAMPLES
from app.services.regression import evaluate_dataset


def find_org() -> str:
    with session_scope() as db:
        org = db.query(Organisation).filter(Organisation.slug == ORG["slug"]).first()
        if org is None:
            return ""
        return org.id


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeat", type=int, default=3)
    parser.add_argument("--json", default="eval/report.json")
    parser.add_argument("--md", default="eval/report.md")
    parser.add_argument("--heldout", default="eval/heldout.json",
                        help="where to write the held-out adversarial set results")
    args = parser.parse_args()

    logging.basicConfig(level=logging.WARNING)
    init_db()
    org_id = find_org()
    if not org_id:
        print("No seeded workspace found. Run `python -m seed.seed` first.")
        return 1

    with session_scope() as db:
        # honour_exceptions=False: the labelled set measures the reviewers against the
        # written brand rules. Manager-approved exceptions are later policy decisions and
        # are exercised by the app + regression runs, not by this benchmark.
        result = evaluate_dataset(db, org_id=org_id, samples=SAMPLES, repeat_runs=args.repeat,
                                  honour_exceptions=False)

    rows = result["comparison"]["rows"]
    header = (f"{'reviewer':15s} {'prec':>6s} {'rec':>6s} {'f1':>6s} {'fpr':>6s}   "
              f"{'base prec':>9s} {'base rec':>8s} {'base f1':>7s} {'Δf1':>6s}")
    print("\nSentinel AI — labelled-set evaluation")
    print(f"samples: {result['samples']}   repeat runs: {args.repeat}\n")
    print(header)
    print("-" * len(header))
    for row in rows:
        print(f"{row['reviewer']:15s} {row['precision']:6.2f} {row['recall']:6.2f} {row['f1']:6.2f} "
              f"{row['false_positive_rate']:6.2f}   {row['baseline_precision'] or 0:9.2f} "
              f"{row['baseline_recall'] or 0:8.2f} {row['baseline_f1'] or 0:7.2f} {row['delta_f1']:+6.2f}")
    o, b = result["comparison"]["candidate_overall"], result["comparison"]["baseline_overall"]
    print("-" * len(header))
    print(f"{'MICRO':15s} {o['micro_precision']:6.2f} {o['micro_recall']:6.2f} {o['micro_f1']:6.2f} "
          f"{o['mean_false_positive_rate']:6.2f}   {b['micro_precision']:9.2f} {b['micro_recall']:8.2f} "
          f"{b['micro_f1']:7.2f}")
    print(f"\nmean false-positive rate: pipeline {o['mean_false_positive_rate']:.2f} "
          f"vs baseline {b['mean_false_positive_rate']:.2f}")
    if result["comparison"]["regressions"]:
        print("\nREGRESSIONS vs baseline:", result["comparison"]["regressions"])

    for path in (args.json, args.md):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(args.json, "w") as fh:
        json.dump(result, fh, indent=2, default=str)
    with open(args.md, "w") as fh:
        fh.write(to_markdown(result))

    # ---- held-out adversarial set, scored and reported separately ----------
    from seed.heldout_samples import HELDOUT, SHARED_VOCABULARY_NOTE

    with session_scope() as db:
        heldout = evaluate_dataset(db, org_id=org_id, samples=HELDOUT, repeat_runs=args.repeat,
                                   honour_exceptions=False)
    from eval.metrics import relaxed

    heldout["relaxed"] = relaxed(heldout["predictions"])
    heldout["note"] = SHARED_VOCABULARY_NOTE
    heldout["kind"] = "heldout_adversarial"
    with open(args.heldout, "w") as fh:
        json.dump(heldout, fh, indent=2, default=str)

    # append the held-out section to the markdown so both numbers are always read together
    with open(args.md, "a") as fh:
        fh.write(to_heldout_markdown(heldout))

    ho = heldout["comparison"]["candidate_overall"]
    print(f"\nheld-out adversarial set ({heldout['samples']} samples, never used for tuning)")
    rl = heldout["relaxed"]
    print(f"  strict (right reviewer AND span) P/R/F1 {ho['micro_precision']:.2f}/{ho['micro_recall']:.2f}/"
          f"{ho['micro_f1']:.2f}  mean FP rate {ho['mean_false_positive_rate']:.2f}")
    print(f"  relaxed (any reviewer, span covered)  P/R/F1 {rl['precision']:.2f}/{rl['recall']:.2f}/{rl['f1']:.2f}")
    if heldout["comparison"]["regressions"]:
        print(f"  regressions: {heldout['comparison']['regressions']}")

    print(f"\nwrote {args.json}, {args.md} and {args.heldout}")
    return 0


def to_heldout_markdown(heldout: dict) -> str:
    ho = heldout["comparison"]["candidate_overall"]
    rl = heldout["relaxed"]
    lines = [
        "",
        "---",
        "",
        "## Held-out adversarial set (reported separately)",
        "",
        f"**{heldout['samples']} samples written after the rules and never used for tuning.** "
        "This is the number to trust for generalisation, not the regression table above.",
        "",
        f"{heldout['note']}",
        "",
        "| Scoring | Precision | Recall | F1 |",
        "|---|---|---|---|",
        f"| strict (correct reviewer *and* span overlap) | {ho['micro_precision']:.2f} | "
        f"{ho['micro_recall']:.2f} | {ho['micro_f1']:.2f} |",
        f"| relaxed (any reviewer covering the span) | {rl['precision']:.2f} | {rl['recall']:.2f} | "
        f"{rl['f1']:.2f} |",
        "",
        f"Mean sample-level false-positive rate across the six reviewers on samples that carry no "
        f"seeded mistake: {ho['mean_false_positive_rate']:.2f}.",
        "",
        "### What it missed",
        "",
    ]
    for reviewer, metrics in heldout["candidate"]["per_reviewer"].items():
        if not metrics["missed"]:
            continue
        lines.append(f"**{reviewer}**")
        for miss in metrics["missed"]:
            lines.append(f"- `{miss['sample']}` {miss['type']}: \u201c{miss['span']}\u201d")
        lines.append("")
    lines += [
        "Read this honestly: the rule engine is a regression-checked heuristic, not a language "
        "model. It reproduces the tuning set almost perfectly and generalises at roughly half that "
        "on unfamiliar paraphrases. The LLM configuration is what closes that gap — see "
        "`eval/report_llm.md` (requires an API key; no numbers are written without one).",
        "",
    ]
    return "\n".join(lines)


def to_markdown(result: dict) -> str:
    rows = result["comparison"]["rows"]
    o, b = result["comparison"]["candidate_overall"], result["comparison"]["baseline_overall"]
    lines = [
        "# Sentinel AI — pipeline regression benchmark (rule-based engine)",
        "",
        "This report scores the shipped rule engine against hand-labelled samples. It exists to catch "
        "regressions when rules change. It is **not** an LLM quality measurement: the samples were written "
        "alongside the rules and share their pattern vocabulary, so the numbers describe fit to this set, "
        "not generalisation to unseen copy. LLM quality is measured separately by `eval/run_llm_eval.py`.",
        "",
        f"Labelled samples: **{result['samples']}** (fictional Northwind Analytics content with seeded mistakes; "
        "8 samples are deliberately clean to measure the false-positive rate).",
        "",
        "| Reviewer | Precision | Recall | F1 | FP rate | Baseline P | Baseline R | Baseline F1 | Δ F1 |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        lines.append(
            f"| {row['reviewer']} | {row['precision']:.2f} | {row['recall']:.2f} | {row['f1']:.2f} | "
            f"{row['false_positive_rate']:.2f} | {row['baseline_precision'] or 0:.2f} | "
            f"{row['baseline_recall'] or 0:.2f} | {row['baseline_f1'] or 0:.2f} | {row['delta_f1']:+.2f} |")
    lines += [
        f"| **micro** | {o['micro_precision']:.2f} | {o['micro_recall']:.2f} | {o['micro_f1']:.2f} | "
        f"{o['mean_false_positive_rate']:.2f} | {b['micro_precision']:.2f} | {b['micro_recall']:.2f} | "
        f"{b['micro_f1']:.2f} | {round(o['micro_f1'] - b['micro_f1'], 3):+.2f} |",
        "",
        "## How the numbers are produced",
        "",
        "* A prediction counts as a true positive when the reviewer name matches and its span overlaps the "
        "hand-labelled span (IoU >= 0.3). Each label can only be matched once.",
        "* **False-positive rate** is sample-level: share of samples with no seeded mistake for that reviewer "
        "that nevertheless received a finding. This is the 'crying wolf' number brand teams care about.",
        "* The **single-prompt baseline** is a deliberately weaker rule pass over the same text: every pattern in "
        "one sweep, no per-reviewer job, no cited rule, no evidence requirement, no duplicate merging. It is "
        "deterministic and free. It is **not** an LLM and must not be quoted as one — it exists to show what "
        "structure (six lenses, citations, merging) contributes over a flat keyword sweep.",
        "* The pipeline numbers come from the real code path (`services.pipeline.analyse_text`), including the "
        "deterministic checks and the span-overlap merge step.",
        "* **Shared vocabulary, disclosed:** the samples and the rule pattern lists were written together, so a "
        "reviewer that matches a pattern will often match a sample that was designed around it. That circularity is "
        "why `seed/heldout_samples.py` exists: 20 adversarial samples, written after the rules and never used for "
        "tuning, are scored separately in `eval/heldout.json`. Read the two together.",
        "",
        "## Missed detections (worst 8 per reviewer)",
        "",
    ]
    for reviewer, metrics in result["candidate"]["per_reviewer"].items():
        if not metrics["missed"]:
            continue
        lines.append(f"**{reviewer}**")
        for miss in metrics["missed"]:
            lines.append(f"- `{miss['sample']}` {miss['type']}: “{miss['span']}”")
        lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
