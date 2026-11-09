"""Append-only audit log with a hash chain (tamper-evident)."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditLog


def _digest(prev_hash: str, payload: dict) -> str:
    blob = json.dumps(payload, sort_keys=True, default=str).encode()
    return hashlib.sha256(prev_hash.encode() + blob).hexdigest()


def record(
    db: Session,
    *,
    org_id: str,
    action: str,
    actor_id: str | None = None,
    actor_role: str | None = None,
    entity: str = "",
    entity_id: str | None = None,
    detail: dict[str, Any] | None = None,
) -> AuditLog:
    last = db.execute(
        select(AuditLog).where(AuditLog.org_id == org_id).order_by(AuditLog.created_at.desc()).limit(1)
    ).scalar_one_or_none()
    prev_hash = last.entry_hash if last else ""
    detail = detail or {}
    payload = {
        "org_id": org_id, "action": action, "actor_id": actor_id,
        "entity": entity, "entity_id": entity_id, "detail": detail,
    }
    entry = AuditLog(
        org_id=org_id, actor_id=actor_id, actor_role=actor_role, action=action,
        entity=entity, entity_id=entity_id, detail=detail,
        prev_hash=prev_hash, entry_hash=_digest(prev_hash, payload),
    )
    db.add(entry)
    db.flush()
    return entry


def verify_chain(db: Session, org_id: str) -> dict:
    rows = db.execute(
        select(AuditLog).where(AuditLog.org_id == org_id).order_by(AuditLog.created_at.asc())
    ).scalars().all()
    prev = ""
    for row in rows:
        payload = {
            "org_id": row.org_id, "action": row.action, "actor_id": row.actor_id,
            "entity": row.entity, "entity_id": row.entity_id, "detail": row.detail,
        }
        expected = _digest(prev, payload)
        if row.prev_hash != prev or row.entry_hash != expected:
            return {"ok": False, "broken_at": row.id, "entries": len(rows)}
        prev = row.entry_hash
    return {"ok": True, "entries": len(rows)}
