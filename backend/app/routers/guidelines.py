"""Guideline changes and the rule review queue (C2 / C3).

Two read endpoints and one decision endpoint. Reading is open to anyone who may read
rules; deciding is not: an Admin (or an Approver, for a legal or accessibility rule)
takes the decision, and the rule is untouched until they do.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Document, GuidelineChange, Rule, RuleReviewTask, User
from ..security import Principal, current_user, get_owned
from ..services.guideline_changes import decide as decide_task

router = APIRouter(tags=["guidelines"])

# Who may answer a review task. A legal or accessibility rule needs an Approver at
# minimum, which mirrors the rule-editing path (`PATCH /rules/{id}`).
DECIDERS = ("admin", "brand_manager", "approver")


def _task_out(task: RuleReviewTask, db: Session) -> dict:
    rule = db.get(Rule, task.rule_id)
    decider = db.get(User, task.decided_by) if task.decided_by else None
    return {
        "id": task.id,
        "guideline_change_id": task.guideline_change_id,
        "rule_id": task.rule_id,
        "rule_key": task.rule_key,
        "category": task.category,
        "rule_title": (task.detail or {}).get("rule_title"),
        "rule_body": (task.detail or {}).get("rule_body"),
        "requires_approver": bool(rule.requires_approver) if rule else False,
        "rule_active": bool(rule.active) if rule else False,
        "section_title": task.section_title,
        "change_status": task.change_status,
        "similarity": task.similarity,
        "status": task.status,
        "previous_body": (task.detail or {}).get("previous_body"),
        "current_body": (task.detail or {}).get("current_body"),
        "notes": (task.detail or {}).get("notes") or [],
        "reason": task.reason,
        "decided_by_name": decider.name if decider else None,
        "decided_at": task.decided_at.isoformat() if task.decided_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


@router.get("/guideline-changes")
def list_guideline_changes(status_filter: str | None = None,
                           principal: Principal = Depends(current_user),
                           db: Session = Depends(get_db)):
    """Newest first. Each change carries its section diff and the tasks it opened."""
    principal.require("rules:read")
    query = select(GuidelineChange).where(GuidelineChange.org_id == principal.org_id)
    if status_filter:
        query = query.where(GuidelineChange.status == status_filter)
    changes = db.execute(query.order_by(GuidelineChange.created_at.desc())).scalars().all()

    tasks = db.execute(select(RuleReviewTask)
                       .where(RuleReviewTask.org_id == principal.org_id)).scalars().all()
    by_change: dict[str, list[RuleReviewTask]] = {}
    for task in tasks:
        by_change.setdefault(task.guideline_change_id, []).append(task)

    out = []
    for change in changes:
        document = db.get(Document, change.current_document_id)
        own = by_change.get(change.id, [])
        out.append({
            "id": change.id,
            "filename": change.filename,
            "current_version": change.current_version,
            "previous_version": change.previous_version,
            "summary": change.summary or {},
            "sections": change.sections or [],
            "status": change.status,
            "created_at": change.created_at.isoformat() if change.created_at else None,
            "current_document_id": change.current_document_id,
            "has_original": bool(document and document.storage_key),
            "tasks": [_task_out(t, db) for t in own],
            "open_tasks": sum(1 for t in own if t.status == "needs_review"),
        })
    return out


@router.get("/rule-review-tasks")
def list_review_tasks(status_filter: str = "needs_review",
                      principal: Principal = Depends(current_user),
                      db: Session = Depends(get_db)):
    principal.require("rules:read")
    query = select(RuleReviewTask).where(RuleReviewTask.org_id == principal.org_id)
    if status_filter and status_filter != "all":
        query = query.where(RuleReviewTask.status == status_filter)
    rows = db.execute(query.order_by(RuleReviewTask.created_at.desc())).scalars().all()
    return [_task_out(t, db) for t in rows]


@router.get("/rule-review-tasks/count")
def count_review_tasks(principal: Principal = Depends(current_user),
                       db: Session = Depends(get_db)):
    """The number behind the "needs review" badge. Cheap enough to poll."""
    principal.require("rules:read")
    rows = db.execute(select(RuleReviewTask).where(RuleReviewTask.org_id == principal.org_id,
                                                   RuleReviewTask.status == "needs_review")
                      ).scalars().all()
    return {"needs_review": len(rows), "rules": sorted({t.rule_key for t in rows})}


@router.post("/rule-review-tasks/{task_id}/decide")
def decide(task_id: str, body: dict, principal: Principal = Depends(current_user),
           db: Session = Depends(get_db)):
    """keep | edit | retire. Nothing has changed until this returns."""
    # Role check rather than `brand_kit:write`: that permission excludes the Approver
    # role, and an Approver is exactly who has to answer a legal or accessibility task.
    task = get_owned(db, RuleReviewTask, task_id, principal)
    rule = db.get(Rule, task.rule_id)

    action = (body.get("action") or "").strip().lower()
    if action not in ("keep", "edit", "retire"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "action must be keep, edit or retire.")
    if principal.role not in DECIDERS:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"Role '{principal.role}' may not answer a rule review task.")
    # A rule that guards legal exposure or accessibility needs an Approver, exactly as
    # editing it does. A Brand Manager cannot wave that away from this screen either —
    # retiring a legal rule here must be as gated as retiring it in the rule editor.
    if rule is not None and rule.requires_approver and principal.role not in (
            "admin", "approver"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "This rule needs an Approver to keep, edit or retire it. "
                            "Ask an Approver to decide.")

    result = decide_task(db, task, principal, action=action, body=body.get("body"),
                         title=body.get("title"), reason=body.get("reason"))
    db.commit()
    return {**result, "task": _task_out(task, db)}
