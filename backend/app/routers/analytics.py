"""Analytics, audit log and organisation controls."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record, verify_chain
from ..db import get_db
from ..models import (
    AnalysisRun, Asset, AuditLog, BrandKit, Chunk, Comment, ContentItem, ContentVersion, Document,
    Fact, Finding, Organisation, Override, Rule, RuleVersion, Term, User,
)
from ..schemas import AnalyticsSummaryOut
from ..security import Principal, current_user
from ..services import analytics as analytics_service

router = APIRouter(tags=["analytics"])


@router.get("/analytics/summary", response_model=AnalyticsSummaryOut)
def summary(window_days: int = 90, principal: Principal = Depends(current_user),
            db: Session = Depends(get_db)):
    principal.require("analytics:read")
    return analytics_service.summary(db, org_id=principal.org_id, window_days=window_days)


@router.get("/audit")
def audit(limit: int = 100, action: str | None = None,
          principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("audit:read")
    q = select(AuditLog).where(AuditLog.org_id == principal.org_id)
    if action:
        q = q.where(AuditLog.action == action)
    rows = db.execute(q.order_by(AuditLog.created_at.desc()).limit(min(limit, 500))).scalars().all()
    actors = {u.id: u.name for u in db.execute(select(User).where(User.org_id == principal.org_id)).scalars()}
    return {
        "entries": [{
            "id": r.id, "action": r.action, "actor": actors.get(r.actor_id, "system"),
            "actor_role": r.actor_role, "entity": r.entity, "entity_id": r.entity_id,
            "detail": r.detail, "created_at": r.created_at, "entry_hash": r.entry_hash,
        } for r in rows],
        "chain": verify_chain(db, principal.org_id),
    }


@router.get("/organisation")
def get_organisation(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    org = db.get(Organisation, principal.org_id)
    users = db.execute(select(User).where(User.org_id == principal.org_id)).scalars().all()
    return {
        "id": org.id, "name": org.name, "slug": org.slug,
        "departments": org.department_list or [],
        "users": [{"id": u.id, "name": u.name, "email": u.email, "role": u.role,
                   "department": u.department} for u in users],
        "defaults": {"max_upload_mb": __import__("app.config", fromlist=["settings"]).settings.max_upload_mb},
    }


@router.delete("/organisation")
def delete_organisation(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    """Right to erasure: delete the organisation and everything scoped to it."""
    principal.require("admin:write")
    org = db.get(Organisation, principal.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    org_id = org.id
    from datetime import datetime, timezone
    for model in (Finding, AnalysisRun, ContentVersion, Comment, ContentItem, Chunk, Term, Fact,
                  Asset, RuleVersion, Rule, Document, BrandKit, Override, AuditLog, User):
        for row in db.execute(select(model).where(model.org_id == org_id)).scalars():
            db.delete(row)
        db.flush()
    db.delete(org)
    db.commit()
    return {"deleted": True, "org_id": org_id}
