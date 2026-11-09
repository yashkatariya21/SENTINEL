"""Adaptive learning: answer the learning prompt, promote an override, inspect rules."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ContentItem, Decision, Finding, Override, RegressionRun, Rule, RuleVersion, User
from ..schemas import OverrideAnswerIn, PromoteIn
from ..security import Principal, current_user, get_owned
from ..services import workflows

router = APIRouter(tags=["learning"])


@router.get("/overrides")
def list_overrides(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("rules:read")
    q = select(Override).where(Override.org_id == principal.org_id)
    if not principal.is_manager_or_above:
        q = q.where(Override.manager_id == principal.user_id)
    rows = db.execute(q.order_by(Override.created_at.desc()).limit(100)).scalars().all()
    out = []
    for o in rows:
        finding = db.get(Finding, o.finding_id)
        item = db.get(ContentItem, finding.content_item_id) if finding else None
        manager = db.get(User, o.manager_id)
        version = db.get(RuleVersion, o.proposed_version_id) if o.proposed_version_id else None
        rule = db.get(Rule, o.rule_id) if o.rule_id else None
        out.append({
            "id": o.id, "status": o.status, "reason": o.reason,
            "scope_choice": o.scope_choice, "scope_department": o.scope_department,
            "scope_content_type": o.scope_content_type,
            "manager": manager.name if manager else "", "created_at": o.created_at,
            "finding": {"id": finding.id, "issue": finding.issue, "severity": finding.severity,
                        "category": finding.category} if finding else None,
            "content": {"id": item.id, "title": item.title} if item else None,
            "proposed_body": o.proposed_body,
            "rule_key": rule.key if rule else None,
            "new_version": version.version if version else None,
            "approval_required_from": o.approval_required_from,
            "regression": o.regression,
        })
    return out


@router.post("/overrides/{override_id}/answer")
def answer_learning_prompt(override_id: str, body: OverrideAnswerIn,
                           principal: Principal = Depends(current_user),
                           db: Session = Depends(get_db)):
    """The 'Make this an approved rule?' prompt. Yes / No / scoped."""
    principal.require("decision:make")
    override = get_owned(db, Override, override_id, principal)
    if body.scope == "department" and not body.department:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A department is required for that scope.")
    if body.scope == "content_type" and body.content_type not in ("social_post", "blog", "ad", "email"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A content type is required for that scope.")
    workflows.answer_learning_prompt(
        db, override, principal, make_rule=body.make_rule, scope=body.scope,
        department=body.department, content_type=body.content_type, reason=body.reason,
    )
    db.commit()
    finding = db.get(Finding, override.finding_id)
    return {
        "override_id": override.id, "status": override.status,
        "requires_approver": override.approval_required_from == "approver",
        "category": finding.category if finding else None,
        "next_step": ("An Approver must confirm this legal/accessibility rule change."
                      if override.status == "pending_approval" else
                      ("Rule version created and regression suite re-run." if override.status == "promoted"
                       else "No rule change was made.")),
        "regression": override.regression,
    }


@router.post("/overrides/{override_id}/promote")
def promote_override(override_id: str, body: PromoteIn | None = None,
                     principal: Principal = Depends(current_user),
                     db: Session = Depends(get_db)):
    """Create a new rule version from the override (Approver for legal/accessibility)."""
    override = get_owned(db, Override, override_id, principal)
    if override.status == "promoted":
        raise HTTPException(status.HTTP_409_CONFLICT, "This override has already been promoted.")
    workflows.promote(db, override, principal, note=(body.approver_note if body else None))
    db.commit()
    return {"override_id": override.id, "status": override.status,
            "new_version_id": override.proposed_version_id,
            "regression": override.regression,
            "passed": (override.regression or {}).get("passed")}


@router.get("/regressions")
def list_regressions(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("analytics:read")
    rows = db.execute(select(RegressionRun).where(RegressionRun.org_id == principal.org_id)
                      .order_by(RegressionRun.created_at.desc()).limit(20)).scalars().all()
    return [{"id": r.id, "trigger": r.trigger, "passed": r.passed, "created_at": r.created_at,
             "metrics": r.metrics} for r in rows]
