"""Turning a guideline diff into human review tasks (C2).

The rule of the whole product applies here without exception: **nothing changes on
its own.** When a section that a rule was drawn from is edited or deleted, the rule
keeps running exactly as it was and a task is opened for a person. The three answers
are keep, edit (which creates a new rule version) and retire; each one is written to
the audit log with who, when and why.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record
from ..models import Document, GuidelineChange, Rule, RuleVersion, RuleReviewTask
from .guideline_diff import SectionChange, normalise_title, summarise

log = logging.getLogger("sentinel.guidelines")


def _lineage(document: Document) -> set[str]:
    """Every document id in the chain the given version belongs to.

    A guideline is replaced again and again; a rule proposed from v1 is still standing
    on v1's text when v4 arrives. Comparing only against the immediately previous
    document loses every rule older than one generation, so the whole chain recorded at
    upload (`meta["lineage"]`) counts as "the document this rule came from".
    """
    ids = {document.id}
    for item in (document.meta or {}).get("lineage") or []:
        if isinstance(item, dict) and item.get("document_id"):
            ids.add(item["document_id"])
    return ids


def _rule_versions_on(db: Session, *, org_id: str, document_ids: set[str],
                      section_titles: set[str]) -> list[tuple[Rule, RuleVersion]]:
    """Active rule versions whose source section is one of `section_titles`.

    A version belongs here when it was drawn from *any* document in this guideline's
    lineage, or when it names no document at all (rules proposed before documents were
    recorded keep working; they are matched on the section title alone, which is the
    only evidence we have for them).
    """
    rows = db.execute(
        select(Rule, RuleVersion)
        .join(RuleVersion, RuleVersion.rule_id == Rule.id)
        .where(Rule.org_id == org_id, Rule.active.is_(True),
               RuleVersion.status == "active",
               RuleVersion.version == Rule.current_version)
    ).all()
    wanted = {normalise_title(t) for t in section_titles if t}
    out = []
    for rule, version in rows:
        section = normalise_title(version.source_section or "")
        from_same_lineage = version.source_document_id in document_ids or \
            version.source_document_id is None
        if section and section in wanted and from_same_lineage:
            out.append((rule, version))
    return out


def record_change(db: Session, *, org_id: str, principal, previous: Document, current: Document,
                  sections: list[SectionChange]) -> dict:
    """Store the diff and open a review task per affected rule. Never mutates a rule."""
    counts = summarise(sections)
    change = GuidelineChange(
        org_id=org_id, previous_document_id=previous.id, current_document_id=current.id,
        filename=current.filename, previous_version=previous.version,
        current_version=current.version, summary=counts,
        sections=[s.to_dict() for s in sections],
        status="open" if counts["changed"] or counts["removed"] else "reviewed",
        created_by=principal.user_id,
    )
    db.add(change)
    db.flush()

    # Only sections that moved can invalidate a rule. An added section cannot.
    affected = [s for s in sections if s.status in ("changed", "removed")]
    lineage = _lineage(previous)
    for section in affected:
        titles = {t for t in (section.title, section.previous_title) if t}
        for rule, version in _rule_versions_on(db, org_id=org_id, document_ids=lineage,
                                               section_titles=titles):
            existing = db.execute(
                select(RuleReviewTask).where(RuleReviewTask.org_id == org_id,
                                             RuleReviewTask.rule_id == rule.id,
                                             RuleReviewTask.guideline_change_id == change.id)
            ).scalars().first()
            if existing is not None:
                continue
            db.add(RuleReviewTask(
                org_id=org_id, guideline_change_id=change.id, rule_id=rule.id,
                rule_version_id=version.id, rule_key=rule.key, category=rule.category,
                section_title=section.title, change_status=section.status,
                similarity=section.similarity, status="needs_review",
                detail={
                    "rule_title": version.title, "rule_body": version.body,
                    "previous_body": section.previous_body, "current_body": section.body,
                    "similar_to": section.similar_to, "notes": section.notes,
                },
            ))
    db.flush()

    record(db, org_id=org_id, action="guideline.changed", actor_id=principal.user_id,
           actor_role=principal.role, entity="guideline_change", entity_id=change.id,
           detail={"filename": current.filename, "from_version": previous.version,
                   "to_version": current.version, **counts})
    return {"change_id": change.id, "tasks": db.query(RuleReviewTask)
            .filter(RuleReviewTask.guideline_change_id == change.id).count(), "summary": counts}


# --------------------------------------------------------------------------- #
def decide(db: Session, task: RuleReviewTask, principal, *, action: str,
           body: str | None = None, title: str | None = None,
           reason: str | None = None) -> dict:
    """keep | edit | retire. The rule is only ever changed by this call."""
    from fastapi import HTTPException, status as http

    rule = db.get(Rule, task.rule_id)
    if rule is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "That rule no longer exists.")
    if task.status != "needs_review":
        raise HTTPException(http.HTTP_409_CONFLICT,
                            f"This task was already answered ({task.status}).")

    if action == "keep":
        task.status = "kept"
        detail = {"decision": "keep"}
    elif action == "retire":
        # Retiring is not deleting: every version stays, the rule simply stops being used.
        rule.active = False
        task.status = "retired"
        detail = {"decision": "retire", "rule_key": rule.key}
    elif action == "edit":
        current = db.execute(select(RuleVersion).where(RuleVersion.rule_id == rule.id,
                                                       RuleVersion.version == rule.current_version)
                             ).scalars().first()
        if current is None:
            raise HTTPException(http.HTTP_409_CONFLICT, "Rule has no current version.")
        new_body = (body or "").strip() or current.body
        if new_body == current.body and not title:
            raise HTTPException(http.HTTP_400_BAD_REQUEST,
                                "An edit needs new rule text. To accept the change, choose keep.")
        for old in db.execute(select(RuleVersion).where(RuleVersion.rule_id == rule.id,
                                                        RuleVersion.status == "active")).scalars():
            old.status = "superseded"
        from ..llm.factory import get_adapter

        version = RuleVersion(
            org_id=rule.org_id, rule_id=rule.id, version=rule.current_version + 1,
            title=(title or current.title)[:300], body=new_body[:900],
            scope_department=current.scope_department, scope_content_type=current.scope_content_type,
            author_id=principal.user_id,
            reason=reason or f"Edited after the guideline section “{task.section_title}” changed.",
            status="active", source_document_id=current.source_document_id,
            source_page=current.source_page, source_section=current.source_section,
            embedding=get_adapter().embed([new_body])[0],
        )
        db.add(version)
        rule.current_version += 1
        db.flush()
        task.status = "edited"
        detail = {"decision": "edit", "rule_key": rule.key, "version": version.version}
    else:
        raise HTTPException(http.HTTP_400_BAD_REQUEST, "action must be keep, edit or retire.")

    task.decided_by = principal.user_id
    task.decided_at = datetime.now(timezone.utc)
    task.reason = reason
    db.flush()

    change = db.get(GuidelineChange, task.guideline_change_id)
    if change is not None:
        open_tasks = db.execute(
            select(RuleReviewTask).where(RuleReviewTask.guideline_change_id == change.id,
                                         RuleReviewTask.status == "needs_review")
        ).scalars().all()
        if not open_tasks:
            change.status = "reviewed"

    record(db, org_id=task.org_id, action=f"rule_review.{action}", actor_id=principal.user_id,
           actor_role=principal.role, entity="rule_review_task", entity_id=task.id,
           detail={**detail, "section": task.section_title, "reason": reason})
    db.flush()
    return {"task_id": task.id, "status": task.status, **detail}
