"""Evaluation endpoints: serve the measured reports, and re-run the benchmark on demand.

Nothing here computes an estimate. The numbers come from a file written by
`eval/run_eval.py` (rule engine, no key needed) or, when no file is reachable, from a
*recorded copy* of that file baked into `app/eval_snapshot.py` at build time. The
response always says which of the two it used and when it was recorded, so a bundled
snapshot is never presented as a live measurement.

That fallback exists for a concrete reason: a serverless deploy ships only the files
traced from its entry point, so `eval/report.json` is absent there and every evaluation
number would read "not measured" on a perfectly healthy deployment.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..security import Principal, current_user

router = APIRouter(tags=["evaluation"])

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval"

# Where each report lives on disk, and what to call it when the caller asks "where did
# these numbers come from?".
SOURCES = {
    "regression": "eval/report.json",
    "heldout": "eval/heldout.json",
    "llm": "eval/report_llm.json",
}


def _read(name: str) -> dict[str, Any] | None:
    path = EVAL_DIR / name
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def _snapshot() -> Any:
    """The build-time copy of the last recorded run (see `eval/snapshot.py`)."""
    try:
        from .. import eval_snapshot
    except Exception:  # pragma: no cover - only if the file was never generated
        return None
    return eval_snapshot


@router.get("/evaluation")
def evaluation(principal: Principal = Depends(current_user)):
    """The measured state of the system. Managers and above only."""
    principal.require("analytics:read")

    snap = _snapshot()

    # A file on disk wins: it is the freshest thing anyone measured. The baked snapshot is
    # the fallback, and it is labelled as such all the way to the screen.
    regression = _read("report.json")
    regression_source = SOURCES["regression"]
    if regression is None and snap is not None:
        regression = getattr(snap, "REPORT", None)
        regression_source = "app/eval_snapshot.py (recorded copy)"

    heldout = _read("heldout.json")
    heldout_source = SOURCES["heldout"]
    if heldout is None and snap is not None:
        heldout = getattr(snap, "HELDOUT", None)
        heldout_source = "app/eval_snapshot.py (recorded copy)"

    llm = _read("report_llm.json")
    llm_source = SOURCES["llm"] if llm is not None else None
    # The markdown column is tracked in git and needs no key: it is the offline engine's
    # row. Serving it means the LLM card can show *something measured* instead of nothing.
    llm_markdown = None
    md_path = EVAL_DIR / "report_llm.md"
    if md_path.exists():
        try:
            llm_markdown = md_path.read_text()[:20_000]
        except OSError:
            llm_markdown = None
    if llm_markdown is None and snap is not None:
        llm_markdown = getattr(snap, "LLM_MARKDOWN", None)

    regression_block = _summarise(regression)
    heldout_block = _summarise(heldout, heldout=True)
    if regression_block is not None:
        regression_block["source"] = regression_source
        regression_block["recorded_at"] = (regression or {}).get("generated_at") or getattr(snap, "RECORDED_AT", None)
        regression_block["provider"] = (regression or {}).get("provider") or getattr(snap, "PROVIDER", None)
        regression_block["model"] = (regression or {}).get("model") or getattr(snap, "MODEL", None)
    if heldout_block is not None:
        heldout_block["source"] = heldout_source

    return {
        "regression": regression_block,
        "heldout": heldout_block,
        "llm": llm,
        "llm_markdown": llm_markdown,
        "llm_source": llm_source,
        "llm_configured": bool(settings.llm_api_key) and (settings.llm_provider or "local") != "local",
        # What the screen needs to offer a real fix instead of an instruction.
        "can_generate": bool(regression is None),
        "looked_for": SOURCES["regression"],
        "provenance": {
            "regression": "eval/run_eval.py — rule engine, deterministic, no API key",
            "heldout": "eval/run_eval.py --samples heldout — 20 adversarial samples never used for tuning",
            "llm": "eval/run_llm_eval.py — real hosted calls, cached by input hash",
            "warning": (
                "The regression numbers describe fit to a set written alongside the rules. "
                "The held-out numbers describe generalisation. They are not interchangeable."
            ),
        },
        "generated": {
            "regression": (regression or {}).get("generated_at") or getattr(snap, "RECORDED_AT", None),
            "llm": (llm or {}).get("generated_at"),
        },
    }


@router.post("/evaluation/run")
def run_benchmark(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    """Re-run the rule-engine benchmark (regression + held-out) and rewrite the report files.

    Deliberately synchronous: it takes a couple of seconds on the local engine and the
    caller wants the fresh numbers, not a job id. The hosted-LLM benchmark is *not*
    runnable from here — it spends money and must be started explicitly by an operator.
    """
    principal.require("analytics:read")
    if principal.role not in ("admin", "brand_manager", "manager"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only a manager or admin can re-run the benchmark.")

    from eval.run_eval import main as run_eval_main  # local import: eval depends on app

    try:
        import sys

        argv = sys.argv
        sys.argv = ["eval.run_eval"]
        try:
            code = run_eval_main()
        finally:
            sys.argv = argv
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR,
                            f"Benchmark failed: {type(exc).__name__}") from exc
    if code != 0:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR,
                            "Benchmark ran but did not produce a report (see server logs).")
    return evaluation(principal)


def _summarise(report: dict | None, *, heldout: bool = False) -> dict | None:
    if not report:
        return None
    comparison = report.get("comparison", {})
    overall = comparison.get("candidate_overall", {})
    rows = comparison.get("rows", [])
    missed = []
    for reviewer, metrics in (report.get("candidate", {}).get("per_reviewer") or {}).items():
        for miss in metrics.get("missed", []):
            missed.append({"reviewer": reviewer, **miss})
    return {
        "samples": report.get("samples"),
        "overall": overall,
        "rows": rows,
        # The measurement behind the confidence score. Shown next to the table because a
        # band that does not separate is a sort order, not a probability.
        "bands": report.get("confidence_bands"),
        "relaxed": report.get("relaxed"),
        "missed": missed,
        "note": report.get("note"),
        "is_heldout": heldout,
    }
