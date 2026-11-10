"""Evaluation endpoints: serve the measured reports, and re-run the benchmark on demand.

Nothing here computes an estimate. The numbers come from files written by
`eval/run_eval.py` (rule engine, no key needed) and `eval/run_llm_eval.py`
(hosted LLM, needs a key). If a file is missing, the field is null and the UI says
"not measured" rather than showing a placeholder.
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


def _read(name: str) -> dict[str, Any] | None:
    path = EVAL_DIR / name
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


@router.get("/evaluation")
def evaluation(principal: Principal = Depends(current_user)):
    """The measured state of the system. Managers and above only."""
    principal.require("analytics:read")

    regression = _read("report.json")
    heldout = _read("heldout.json")
    llm = _read("report_llm.json")

    return {
        "regression": _summarise(regression),
        "heldout": _summarise(heldout, heldout=True),
        "llm": llm,
        "llm_configured": bool(settings.llm_api_key) and (settings.llm_provider or "local") != "local",
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
            "regression": (regression or {}).get("generated_at"),
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
        "relaxed": report.get("relaxed"),
        "missed": missed,
        "note": report.get("note"),
        "is_heldout": heldout,
    }
