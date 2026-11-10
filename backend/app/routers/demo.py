"""One-click demo loader.

Three endpoints, all guarded by `DEMO_MODE` (404 when off) and rate limited per IP:

* `POST /v1/demo/load`   — ensure the Northwind workspace and analyse every labelled
                           sample. Idempotent: a second call creates no duplicates.
* `GET  /v1/demo/status` — progress the UI polls once a second.
* `POST /v1/demo/reset`  — delete demo-flagged rows only.

Progress lives in the `demo_jobs` table rather than in a module global, so a restarted
API process can still answer `/status` truthfully.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db, session_scope
from ..models import (
    AnalysisRun, Approval, Comment, ContentItem, ContentVersion, Decision, DemoJob, Finding,
    Organisation, Override, Term,
)
from ..ratelimit import hit
from ..security import Principal, current_user
from ..services.pipeline import execute_run
from seed.brand_kit import ORG

log = logging.getLogger("sentinel.demo")

router = APIRouter(prefix="/demo", tags=["demo"])

_state_lock = __import__("threading").Lock()
_running = {"active": False}


def require_demo_mode() -> None:
    """404 when DEMO_MODE is off — the routes simply do not exist.

    Declared as a dependency so it is evaluated *before* the auth dependency: with demo
    mode off, an anonymous call must get 404, not 401.
    """
    if not settings.demo_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")


def _demo_mode_guard(request: Request, bucket: str) -> None:
    require_demo_mode()
    hit(bucket, request, settings.demo_rate_limit_per_minute)


def _demo_org(db: Session) -> Organisation | None:
    return db.execute(select(Organisation).where(Organisation.slug == ORG["slug"])).scalars().first()


def _job_for(db: Session, org_id: str) -> DemoJob | None:
    return db.execute(select(DemoJob).where(DemoJob.org_id == org_id)
                      .order_by(DemoJob.created_at.desc())).scalars().first()


def _counts(org_id: str) -> dict:
    """Counts for the demo progress panel — demo content only.

    A workspace can hold real content alongside the demo. Counting every run would
    make the panel (and the `idle`/`done` state after a reset) lie about the demo,
    so both are scoped to rows flagged `is_demo`.
    """
    with session_scope() as db:
        demo_item_ids = {i.id for i in db.execute(
            select(ContentItem).where(ContentItem.org_id == org_id,
                                      ContentItem.is_demo.is_(True))).scalars().all()}
        total = len(demo_item_ids)
        runs = [r for r in db.execute(select(AnalysisRun).where(AnalysisRun.org_id == org_id)).scalars().all()
                if r.content_item_id in demo_item_ids]
        analysed = sum(1 for r in runs if r.status == "complete")
        failed = sum(1 for r in runs if r.status == "failed")
        findings = sum(
            1 for f in db.execute(select(Finding).where(Finding.org_id == org_id)).scalars().all()
            if f.content_item_id in demo_item_ids
        )
    return {"total": total, "analysed": analysed, "failed": failed, "findings": findings}


def status_payload(db: Session, org_id: str | None) -> dict:
    """Shape used by /status and by /load when a job is already running."""
    empty = {"state": "idle", "phase": "", "total": 0, "analysed": 0, "findings": 0,
             "started_at": None, "finished_at": None, "errors": [], "demo_mode": settings.demo_mode}
    if org_id is None:
        return empty
    job = _job_for(db, org_id)
    counts = _counts(org_id)
    if job is None:
        # no job row, but a seeded database still has analysable content
        return {**empty, **counts, "state": "done" if counts["analysed"] else "idle"}
    state = job.state
    if state == "running" and not _running["active"] and job.analysed < job.total:
        # the process that was doing the work is gone (restart): tell the truth
        state = "error"
    return {
        "state": state,
        "phase": job.phase or "",
        "total": job.total or counts["total"],
        "analysed": max(job.analysed, counts["analysed"]),
        "findings": counts["findings"],
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "errors": job.errors or [],
        "demo_mode": settings.demo_mode,
    }


def _set_job(org_id: str, **fields) -> None:
    with session_scope() as db:
        job = _job_for(db, org_id)
        if job is None:
            job = DemoJob(org_id=org_id, state="idle")
            db.add(job)
            db.flush()
        for key, value in fields.items():
            setattr(job, key, value)


def _run_demo_job(org_id: str) -> None:
    """Background worker: the demo content is built by seed.load_demo (single source of truth)."""
    from seed.seed import load_demo

    try:
        with _state_lock:
            _running["active"] = True
        _set_job(org_id, state="loading", phase="Preparing Northwind", errors=[],
                 started_at=datetime.now(timezone.utc), finished_at=None, analysed=0, total=0)

        def on_phase(text: str) -> None:
            _set_job(org_id, state="running" if "reading" in text.lower() else "running", phase=text)

        def on_progress(done: int, total: int) -> None:
            _set_job(org_id, analysed=done, total=total, phase=f"Reviewed {done}/{total} submissions")

        result = load_demo(on_progress=on_progress, on_phase=on_phase,
                           concurrency=settings.demo_analysis_concurrency)
        _set_job(org_id, state="done", phase="Ready", analysed=result["total"],
                 total=result["total"], errors=result["errors"],
                 finished_at=datetime.now(timezone.utc))
    except Exception as exc:  # noqa: BLE001 - surfaced through /status, never a silent hang
        log.exception("demo load failed")
        _set_job(org_id, state="error", phase="Something went wrong",
                 finished_at=datetime.now(timezone.utc),
                 errors=[f"{type(exc).__name__}: {exc}"])
    finally:
        with _state_lock:
            _running["active"] = False


@router.get("/status")
def demo_status(request: Request, _: None = Depends(require_demo_mode),
                db: Session = Depends(get_db)):
    """Public: the login page and the progress panel both poll this."""
    org = _demo_org(db)
    return status_payload(db, org.id if org else None)


@router.post("/load")
def demo_load(request: Request, background: bool = True,
              _: None = Depends(require_demo_mode), db: Session = Depends(get_db)):
    """Start (or join) the demo load. Idempotent — safe to click twice."""
    _demo_mode_guard(request, "demo")
    org = _demo_org(db)
    if org is None:
        from seed.seed import ensure_workspace
        org_id = ensure_workspace()
        org = db.get(Organisation, org_id)

    job = _job_for(db, org.id)
    if job is not None and job.state in ("loading", "running") and _running["active"]:
        return {"started": False, "reason": "already running", **status_payload(db, org.id)}

    counts = _counts(org.id)
    if job is not None and job.state == "done" and counts["analysed"] >= counts["total"] > 0:
        # already populated: report done instead of re-running 53 analyses
        return {"started": False, "reason": "already loaded", **status_payload(db, org.id)}

    _set_job(org.id, state="loading", phase="Preparing Northwind", started_at=datetime.now(timezone.utc),
             finished_at=None, analysed=0, errors=[], total=counts["total"] or 53)

    if background:
        # response returns immediately; the UI polls /status
        with _state_lock:
            _running["active"] = True
        ThreadPoolExecutor(max_workers=1).submit(_run_demo_job, org.id)
    else:
        _run_demo_job(org.id)
    return {"started": True, **status_payload(db, org.id)}


@router.post("/reset")
def demo_reset(request: Request, _: None = Depends(require_demo_mode),
               principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    """Delete demo-flagged rows for the caller's organisation and nothing else."""
    _demo_mode_guard(request, "demo")
    org = db.get(Organisation, principal.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    if org.slug != ORG["slug"]:
        # a real customer workspace must never be wiped by a demo button
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Reset only applies to the demo workspace.")
    deleted = reset_demo_rows(principal.org_id)
    return {"reset": True, **deleted}


def reset_demo_rows(org_id: str) -> dict:
    """Delete demo content and everything hanging off it, in dependency order."""
    with session_scope() as db:
        item_ids = [i.id for i in db.execute(
            select(ContentItem).where(ContentItem.org_id == org_id,
                                      ContentItem.is_demo.is_(True))).scalars().all()]
        run_ids = [r.id for r in db.execute(
            select(AnalysisRun).where(AnalysisRun.org_id == org_id)).scalars().all()]
        counts = {"content": len(item_ids)}
        if item_ids:
            # dependency order: overrides -> decisions -> findings -> the rest
            db.query(Override).filter(Override.org_id == org_id).delete(synchronize_session=False)
            db.query(Decision).filter(Decision.org_id == org_id).delete(synchronize_session=False)
            db.query(Finding).filter(Finding.content_item_id.in_(item_ids)).delete(synchronize_session=False)
            db.query(Comment).filter(Comment.content_item_id.in_(item_ids)).delete(synchronize_session=False)
            db.query(Approval).filter(Approval.content_item_id.in_(item_ids)).delete(synchronize_session=False)
            db.query(AnalysisRun).filter(AnalysisRun.content_item_id.in_(item_ids)).delete(synchronize_session=False)
            db.query(ContentVersion).filter(ContentVersion.content_item_id.in_(item_ids)).delete(synchronize_session=False)
            db.query(ContentItem).filter(ContentItem.id.in_(item_ids)).delete(synchronize_session=False)
        job = _job_for(db, org_id)
        if job is not None:
            db.delete(job)
    return {"deleted_content": counts["content"]}
