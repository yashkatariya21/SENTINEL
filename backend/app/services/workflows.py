"""Approval workflow and adaptive learning.

Rules that keep humans in control:
* nobody approves their own content item;
* legal and accessibility rule changes require an Approver (or Admin);
* a promoted override always creates a NEW rule version - old versions are
  kept, marked superseded, and can be reverted;
* every promotion triggers a labelled-set regression run.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record
from .exceptions import exception_body, scope_label
from ..models import (
    AnalysisRun, Approval, Comment, ContentItem, ContentVersion, Decision, Fact, Finding,
    Override, Rule, RuleVersion, Term, User,
)
from ..security import Principal
from ..llm.factory import get_adapter

log = logging.getLogger("sentinel.workflow")

CATEGORY_TO_RULE_PREFIX = {
    "brand_voice": "VOI", "terminology": "TERM", "fact": "FACT",
    "visual": "VIS", "accessibility": "A11Y", "legal": "LEG",
}


# --------------------------------------------------------------------------- #
# Content workflow
# --------------------------------------------------------------------------- #
def submit_for_approval(db: Session, item: ContentItem, principal: Principal, note: str | None = None) -> ContentItem:
    if item.owner_id != principal.user_id and not principal.is_manager_or_above:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or a manager can submit this item.")
    latest = db.execute(
        select(AnalysisRun).where(AnalysisRun.content_item_id == item.id,
                                  AnalysisRun.content_version_id == _current_version(db, item).id)
        .order_by(AnalysisRun.created_at.desc())
    ).scalars().first()
    if latest is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Run an analysis before submitting for approval.")
    if latest.status != "complete":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Analysis is {latest.status}; wait for it to complete.")
    open_critical = db.execute(
        select(Finding).where(Finding.analysis_run_id == latest.id,
                              Finding.severity.in_(("high", "critical")),
                              Finding.decision_status == "open")
    ).scalars().all()
    item.status = "in_review"
    item.submitted_at = item.submitted_at or datetime.now(timezone.utc)
    if note:
        db.add(Comment(org_id=item.org_id, content_item_id=item.id,
                       content_version=item.current_version, author_id=principal.user_id, body=note))
    record(db, org_id=item.org_id, action="content.submitted", actor_id=principal.user_id,
           actor_role=principal.role, entity="content_item", entity_id=item.id,
           detail={"version": item.current_version, "open_high_severity": len(open_critical)})
    db.flush()
    return item


def decide(db: Session, item: ContentItem, principal: Principal, *,
           action: str, reason: str | None, version_number: int | None = None) -> Approval:
    principal.require("approve")
    if item.owner_id == principal.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nobody can approve their own content item.")
    if action == "approve" and item.status not in ("in_review", "changes_requested"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Item is '{item.status}', not awaiting approval.")
    if action in ("reject", "request_changes") and not (reason or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A reason is required to reject or request changes.")

    version = version_number or item.current_version
    if action == "approve":
        run = db.execute(
            select(AnalysisRun).where(AnalysisRun.content_item_id == item.id,
                                      AnalysisRun.status == "complete")
            .order_by(AnalysisRun.created_at.desc())
        ).scalars().first()
        if run is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No completed analysis exists for this item.")
        item.status = "approved"
    elif action == "reject":
        item.status = "rejected"
    else:
        item.status = "changes_requested"

    approval = Approval(org_id=item.org_id, content_item_id=item.id, content_version=version,
                        actor_id=principal.user_id, action=action, reason=reason)
    db.add(approval)
    record(db, org_id=item.org_id, action=f"content.{action}", actor_id=principal.user_id,
           actor_role=principal.role, entity="content_item", entity_id=item.id,
           detail={"version": version, "reason": reason})
    db.flush()
    return approval


def add_comment(db: Session, item: ContentItem, principal: Principal, *, body: str,
                visibility: str = "internal") -> Comment:
    if visibility == "external" and principal.role not in ("admin", "brand_manager", "approver", "manager"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only internal staff can post external comments.")
    comment = Comment(org_id=item.org_id, content_item_id=item.id, content_version=item.current_version,
                      author_id=principal.user_id, body=body, visibility=visibility)
    db.add(comment)
    record(db, org_id=item.org_id, action="comment.created", actor_id=principal.user_id,
           actor_role=principal.role, entity="content_item", entity_id=item.id,
           detail={"visibility": visibility})
    db.flush()
    return comment


def _current_version(db: Session, item: ContentItem) -> ContentVersion:
    version = db.execute(
        select(ContentVersion).where(ContentVersion.content_item_id == item.id,
                                     ContentVersion.version == item.current_version)
    ).scalars().first()
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Content version not found")
    return version


# --------------------------------------------------------------------------- #
# Decisions on findings (the manager override path)
# --------------------------------------------------------------------------- #
def decide_on_finding(db: Session, finding: Finding, principal: Principal, *,
                      action: str, reason: str | None,
                      edited_suggestion: str | None) -> tuple[Decision, Override | None]:
    if finding.decision_status != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Finding already {finding.decision_status}.")
    manager_override = action in ("dismiss", "edit") and principal.is_manager_or_above
    decision = Decision(org_id=finding.org_id, finding_id=finding.id, actor_id=principal.user_id,
                        action=action, reason=reason, edited_suggestion=edited_suggestion,
                        manager_override=manager_override)
    db.add(decision)
    finding.decision_status = {"accept": "accepted", "edit": "edited",
                               "dismiss": "dismissed", "escalate": "escalated"}[action]
    db.flush()

    override = None
    if manager_override:
        override = Override(
            org_id=finding.org_id, decision_id=decision.id, finding_id=finding.id,
            rule_id=finding.rule_id, status="awaiting_answer", manager_id=principal.user_id,
            reason=reason or edited_suggestion or "Manager disagreed with the suggestion.",
            proposed_body=_proposed_rule_body(finding, edited_suggestion),
        )
        db.add(override)
        db.flush()

    record(db, org_id=finding.org_id, action=f"finding.{action}", actor_id=principal.user_id,
           actor_role=principal.role, entity="finding", entity_id=finding.id,
           detail={"reason": reason, "manager_override": manager_override})
    return decision, override


def _proposed_rule_body(finding: Finding, edited: str | None) -> str:
    if edited:
        return edited.strip()[:900]
    if finding.rule_quote:
        return finding.rule_quote[:900]
    return f'{finding.issue} — reviewed and rejected by a manager on {datetime.now(timezone.utc):%Y-%m-%d}.'


# --------------------------------------------------------------------------- #
# Learning prompt -> rule version
# --------------------------------------------------------------------------- #
def answer_learning_prompt(db: Session, override: Override, principal: Principal, *,
                           make_rule: bool, scope: str, department: str | None,
                           content_type: str | None, reason: str | None) -> Override:
    if override.manager_id != principal.user_id and principal.role not in ("admin", "brand_manager"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the deciding manager (or a brand manager) can answer.")
    if override.status != "awaiting_answer":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Learning prompt already answered ({override.status}).")

    override.scope_choice = scope
    override.scope_department = department if scope == "department" else None
    override.scope_content_type = content_type if scope == "content_type" else None
    if reason:
        override.reason = reason

    if not make_rule:
        override.status = "declined"
        record(db, org_id=override.org_id, action="override.declined", actor_id=principal.user_id,
               actor_role=principal.role, entity="override", entity_id=override.id,
               detail={"scope": scope})
        db.flush()
        return override

    finding = db.get(Finding, override.finding_id)
    category = finding.category if finding else "terminology"
    requires_approver = category in ("legal", "accessibility")
    override.approval_required_from = "approver" if requires_approver else None

    if requires_approver:
        override.status = "pending_approval"
        record(db, org_id=override.org_id, action="override.pending_approval", actor_id=principal.user_id,
               actor_role=principal.role, entity="override", entity_id=override.id,
               detail={"category": category, "reason": "legal/accessibility rule needs an Approver"})
        db.flush()
        return override

    promote(db, override, principal, note="Auto-approved: category does not require an Approver.")
    return override


def promote(db: Session, override: Override, principal: Principal, *, note: str | None = None) -> Override:
    """Create a NEW rule version from the override. Old versions are retained."""
    finding = db.get(Finding, override.finding_id)
    if finding is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Finding not found")

    category = finding.category
    requires_approver = category in ("legal", "accessibility")
    if requires_approver and principal.role not in ("approver", "admin", "brand_manager"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"{category.title()} rules need an Approver to promote a change.")
    if override.status not in ("pending_approval", "awaiting_answer"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Override is '{override.status}', cannot promote.")

    base_rule = db.get(Rule, override.rule_id) if override.rule_id else None
    narrow = bool(override.scope_department or override.scope_content_type)
    label = scope_label(content_type=override.scope_content_type, department=override.scope_department)
    author = db.get(User, principal.user_id)
    body_text = exception_body(finding.span_text or finding.issue or "",
                               label, override.reason or note, author.name if author else None)

    if base_rule is not None and narrow:
        # A carve-out for one department or content type must NOT weaken the rule for
        # everyone else, so it becomes a sibling rule that carries the exception and the
        # narrow scope. The general rule keeps its current version untouched.
        rule = Rule(
            org_id=override.org_id, brand_kit_id=base_rule.brand_kit_id,
            key=_scoped_key(db, override.org_id, base_rule.key,
                            override.scope_content_type or override.scope_department or "scoped"),
            category=category, check_type=base_rule.check_type,
            requires_approver=base_rule.requires_approver, current_version=0, active=True,
        )
        db.add(rule)
        db.flush()
        version_body = body_text
    elif base_rule is not None:
        # Organisation-wide: the learned exception is a new version of the same rule, so
        # the rule text itself records what is now allowed (and version history shows it).
        rule = base_rule
        version_body = f"{base_rule_body(db, rule)}\n\n{body_text}"
    else:
        rule = Rule(
            org_id=override.org_id, brand_kit_id=_kit_for(db, finding),
            key=_next_learned_key(db, override.org_id, category), category=category,
            check_type="both", requires_approver=requires_approver, current_version=0, active=True,
        )
        db.add(rule)
        db.flush()
        version_body = body_text

    new_version = rule.current_version + 1
    for old in db.execute(select(RuleVersion).where(RuleVersion.rule_id == rule.id)).scalars():
        if old.status == "active":
            old.status = "superseded"

    version = RuleVersion(
        org_id=override.org_id, rule_id=rule.id, version=new_version,
        title=(finding.issue[:120] if finding.issue else "Learned rule"),
        body=version_body[:900],
        scope_department=override.scope_department, scope_content_type=override.scope_content_type,
        author_id=principal.user_id, approver_id=principal.user_id if requires_approver else None,
        reason=(override.reason or note or "Manager override")[:900],
        status="active", source_document_id=None, source_page=None,
        source_section=f"Learned from override {override.id}",
        embedding=get_adapter().embed([version_body])[0],
    )
    db.add(version)
    rule.current_version = new_version
    db.flush()

    override.proposed_version_id = version.id
    override.status = "promoted"
    finding.decision_status = "dismissed" if finding.decision_status == "open" else finding.decision_status

    record(db, org_id=override.org_id, action="rule.promoted", actor_id=principal.user_id,
           actor_role=principal.role, entity="rule_version", entity_id=version.id,
           detail={"rule_key": rule.key, "version": new_version, "category": category,
                   "scope_department": override.scope_department,
                   "scope_content_type": override.scope_content_type, "note": note})

    # regression on the labelled test set - a promotion must not break other checks
    try:
        from .regression import run_regression
        override.regression = run_regression(db, org_id=override.org_id, trigger="promotion",
                                            override_id=override.id)
    except Exception as exc:  # never block the promotion on the eval harness
        log.warning("regression run failed: %s", type(exc).__name__)
        override.regression = {"error": f"{type(exc).__name__}: {exc}"}
    db.flush()
    return override


def revert_rule_version(db: Session, rule: Rule, version: RuleVersion, principal: Principal,
                        reason: str | None) -> RuleVersion:
    """Revert = create a new version whose body is the old version's body."""
    if rule.org_id != principal.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    if principal.role not in ("admin", "brand_manager", "approver"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only Admin, Brand Manager or Approver can revert rules.")
    if rule.requires_approver and principal.role == "manager":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This rule needs an Approver.")

    new_version = rule.current_version + 1
    for old in db.execute(select(RuleVersion).where(RuleVersion.rule_id == rule.id)).scalars():
        if old.status == "active":
            old.status = "superseded"
    restored = RuleVersion(
        org_id=rule.org_id, rule_id=rule.id, version=new_version, title=version.title,
        body=version.body, scope_department=version.scope_department,
        scope_content_type=version.scope_content_type, author_id=principal.user_id,
        reason=f"Reverted to v{version.version}: {reason or 'no reason given'}",
        status="active", source_document_id=version.source_document_id,
        source_page=version.source_page, source_section=version.source_section,
        embedding=get_adapter().embed([version.body])[0],
    )
    db.add(restored)
    rule.current_version = new_version
    db.flush()
    record(db, org_id=rule.org_id, action="rule.reverted", actor_id=principal.user_id,
           actor_role=principal.role, entity="rule_version", entity_id=restored.id,
           detail={"rule_key": rule.key, "restored_from": version.version, "new_version": new_version,
                   "reason": reason})
    return restored


def base_rule_body(db: Session, rule: Rule) -> str:
    """Current body of a rule (used when appending a learned exception to it)."""
    version = db.execute(
        select(RuleVersion).where(RuleVersion.rule_id == rule.id,
                                  RuleVersion.version == rule.current_version)
    ).scalars().first()
    return version.body if version else ""


def _scoped_key(db: Session, org_id: str, base_key: str, scope: str) -> str:
    """TERM-001 + "ad" -> TERM-001-AD (unique per organisation)."""
    suffix = re.sub(r"[^A-Z0-9]+", "", (scope or "SCOPED").upper())[:8] or "SCOPED"
    existing = {r.key for r in db.execute(select(Rule).where(Rule.org_id == org_id)).scalars()}
    key, i = f"{base_key}-{suffix}", 2
    while key in existing:
        key = f"{base_key}-{suffix}{i}"
        i += 1
    return key


def _kit_for(db: Session, finding: Finding) -> str:
    from ..models import BrandKit
    kit = db.execute(select(BrandKit).where(BrandKit.org_id == finding.org_id,
                                            BrandKit.status == "active")).scalars().first()
    if kit is None:
        kit = db.execute(select(BrandKit).where(BrandKit.org_id == finding.org_id)).scalars().first()
    if kit is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No Brand Kit to attach the rule to.")
    return kit.id


def _next_learned_key(db: Session, org_id: str, category: str) -> str:
    prefix = CATEGORY_TO_RULE_PREFIX.get(category, "LEARN")
    n = db.execute(select(Rule).where(Rule.org_id == org_id)).scalars().all()
    existing = {r.key for r in n}
    i = 1
    while f"{prefix}-LEARN{i:02d}" in existing:
        i += 1
    return f"{prefix}-LEARN{i:02d}"
