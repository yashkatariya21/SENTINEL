"""Regression harness: re-run the labelled test set after every rule promotion.

A promotion is only safe if it does not break other reviewers, so after each
the whole labelled set is scored and compared with the previous run.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from eval.baseline import predict as baseline_predict
from eval.metrics import compare, evaluate, locate

from ..models import RegressionRun
from .extraction import blocks_to_text, text_to_blocks

log = logging.getLogger("sentinel.regression")


def _blocks_for(sample: dict) -> tuple[str, list[dict]]:
    return blocks_to_text(text_to_blocks(sample["text"]))


def predictions_for(db: Session, *, org_id: str, samples: list[dict], repeat_runs: int = 1,
                    honour_exceptions: bool = True) -> list[dict]:
    from .pipeline import analyse_text

    out = []
    for sample in samples:
        text, blocks = _blocks_for(sample)
        merged, _prep, _meta = analyse_text(
            db, org_id=org_id, text=text, blocks=blocks,
            content_type=sample.get("content_type", "blog"),
            department=sample.get("department"), repeat_runs=repeat_runs,
            honour_exceptions=honour_exceptions,
        )
        out.append({
            "id": sample["id"], "text": text,
            "labels": [{"reviewer": r, "type": t, "start": locate(text, span)[0],
                        "end": locate(text, span)[1]}
                       for r, t, span in sample["labels"]],
            "predictions": [{"reviewer": f["reviewer"], "start": f["span_start"],
                             "end": f["span_end"]} for f in merged],
        })
    return out


def baseline_for(samples: list[dict]) -> list[dict]:
    out = []
    for sample in samples:
        text, blocks = _blocks_for(sample)
        out.append({
            "id": sample["id"], "text": text,
            "labels": [{"reviewer": r, "type": t, "start": locate(text, span)[0],
                        "end": locate(text, span)[1]}
                       for r, t, span in sample["labels"]],
            "predictions": baseline_predict(text, blocks),
        })
    return out


def evaluate_dataset(db: Session, *, org_id: str, samples: list[dict] | None = None,
                     repeat_runs: int = 1, honour_exceptions: bool = True) -> dict:
    from seed.samples import SAMPLES

    samples = samples if samples is not None else SAMPLES
    candidate = evaluate(predictions_for(db, org_id=org_id, samples=samples, repeat_runs=repeat_runs,
                                         honour_exceptions=honour_exceptions))
    baseline = evaluate(baseline_for(samples))
    comparison = compare(candidate, baseline)
    return {
        "candidate": candidate,
        "baseline": baseline,
        "comparison": comparison,
        "samples": len(samples),
    }


def run_regression(db: Session, *, org_id: str, trigger: str = "promotion",
                   override_id: str | None = None, honour_exceptions: bool = True) -> dict:
    result = evaluate_dataset(db, org_id=org_id, repeat_runs=1, honour_exceptions=honour_exceptions)
    previous = db.execute(
        select(RegressionRun).where(RegressionRun.org_id == org_id)
        .order_by(RegressionRun.created_at.desc()).limit(1)
    ).scalars().first()

    regressions: list[dict] = []
    if previous and previous.metrics:
        prev_metrics = (previous.metrics.get("candidate") or {}).get("per_reviewer", {})
        for reviewer, metrics in result["candidate"]["per_reviewer"].items():
            before = prev_metrics.get(reviewer, {}).get("f1")
            if before is not None and metrics["f1"] < before - 0.05:
                regressions.append({
                    "reviewer": reviewer, "f1_before": before, "f1_after": metrics["f1"],
                    "delta": round(metrics["f1"] - before, 3),
                })

    payload = {
        "trigger": trigger,
        "override_id": override_id,
        "candidate": result["candidate"],
        "baseline": result["baseline"],
        "comparison": result["comparison"],
        "regressions": regressions,
        "passed": not regressions,
        "samples": result["samples"],
    }
    db.add(RegressionRun(
        org_id=org_id, trigger=trigger, override_id=override_id, metrics=payload,
        passed=not regressions, rule_versions=[],
    ))
    db.flush()
    return payload
