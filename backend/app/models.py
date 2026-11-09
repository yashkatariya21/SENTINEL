"""Data model. Every tenant-owned table carries `org_id`.

Tables: organisations, users, memberships, brand_kits, documents, chunks, rules,
rule_versions, terms, facts, assets, content_items, content_versions,
analysis_runs, findings, decisions, overrides, comments, approvals, audit_log,
regression_runs.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def uid() -> str:
    return uuid.uuid4().hex


def now() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now, nullable=False)


# --------------------------------------------------------------------------- #
# Tenancy and identity
# --------------------------------------------------------------------------- #
class Organisation(Base, TimestampMixin):
    __tablename__ = "organisations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    department_list: Mapped[list] = mapped_column(JSON, default=list)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class User(Base, TimestampMixin):
    """Users belong to exactly one organisation in this build (scoped tenancy)."""
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)  # admin|brand_manager|approver|manager|creator|external_creator
    department: Mapped[str | None] = mapped_column(String(80), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("org_id", "email", name="uq_user_org_email"),)


class Membership(Base, TimestampMixin):
    __tablename__ = "memberships"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active")


# --------------------------------------------------------------------------- #
# Brand Kit
# --------------------------------------------------------------------------- #
class BrandKit(Base, TimestampMixin):
    __tablename__ = "brand_kits"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|active
    created_by: Mapped[str | None] = mapped_column(String(32), nullable=True)


class Document(Base, TimestampMixin):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    brand_kit_id: Mapped[str] = mapped_column(ForeignKey("brand_kits.id"), index=True, nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    mime: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), default="")
    storage_key: Mapped[str] = mapped_column(String(400), default="")
    kind: Mapped[str] = mapped_column(String(40), default="guideline")  # guideline|legal|term_list|approved_facts|other
    version: Mapped[int] = mapped_column(Integer, default=1)
    pages: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(24), default="uploaded")  # uploaded|extracted|confirmed|deleted
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class Chunk(Base, TimestampMixin):
    """300-500 token chunk of a brand-kit document + its embedding."""
    __tablename__ = "chunks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True, nullable=False)
    brand_kit_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    document_version: Mapped[int] = mapped_column(Integer, default=1)
    page: Mapped[int] = mapped_column(Integer, default=1)
    ordinal: Mapped[int] = mapped_column(Integer, default=0)
    heading: Mapped[str | None] = mapped_column(String(300), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[list] = mapped_column(JSON, default=list)


class Rule(Base, TimestampMixin):
    """A rule identity; content lives in RuleVersion (immutable history)."""
    __tablename__ = "rules"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    brand_kit_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    key: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # e.g. TERM-002
    category: Mapped[str] = mapped_column(String(40), nullable=False)  # brand_voice|terminology|visual|accessibility|legal|fact
    check_type: Mapped[str] = mapped_column(String(20), default="llm")  # deterministic|llm|both
    requires_approver: Mapped[bool] = mapped_column(Boolean, default=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("org_id", "key", name="uq_rule_org_key"),)


class RuleVersion(Base, TimestampMixin):
    __tablename__ = "rule_versions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    rule_id: Mapped[str] = mapped_column(ForeignKey("rules.id"), index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)  # the quotable rule text
    scope_department: Mapped[str | None] = mapped_column(String(80), nullable=True)
    scope_content_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    author_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    approver_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|superseded|proposed|rejected
    source_document_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_section: Mapped[str | None] = mapped_column(String(300), nullable=True)
    embedding: Mapped[list] = mapped_column(JSON, default=list)
    __table_args__ = (UniqueConstraint("rule_id", "version", name="uq_rule_version"),)


class Term(Base, TimestampMixin):
    __tablename__ = "terms"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    brand_kit_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # banned|approved|required
    value: Mapped[str] = mapped_column(String(200), nullable=False)
    replacement: Mapped[str | None] = mapped_column(String(200), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    rule_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="proposed")  # proposed|confirmed|deleted


class Fact(Base, TimestampMixin):
    __tablename__ = "facts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    brand_kit_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    value: Mapped[str | None] = mapped_column(String(120), nullable=True)
    topic: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_document_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    confirmed_by: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    brand_kit_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # logo|font|colour|other
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[str] = mapped_column(String(200), default="")  # hex, font stack, logo version
    version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="proposed")  # proposed|confirmed|retired
    storage_key: Mapped[str] = mapped_column(String(400), default="")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


# --------------------------------------------------------------------------- #
# Content and analysis
# --------------------------------------------------------------------------- #
class ContentItem(Base, TimestampMixin):
    __tablename__ = "content_items"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(40), nullable=False)  # social_post|blog|ad|email
    department: Mapped[str | None] = mapped_column(String(80), nullable=True)
    owner_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), default="draft")  # draft|in_review|changes_requested|approved|rejected
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ContentVersion(Base, TimestampMixin):
    __tablename__ = "content_versions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    content_item_id: Mapped[str] = mapped_column(ForeignKey("content_items.id"), index=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    body_text: Mapped[str] = mapped_column(Text, default="")
    blocks: Mapped[list] = mapped_column(JSON, default=list)
    filename: Mapped[str | None] = mapped_column(String(300), nullable=True)
    mime: Mapped[str | None] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    storage_key: Mapped[str | None] = mapped_column(String(400), nullable=True)
    author_id: Mapped[str] = mapped_column(String(32), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    __table_args__ = (UniqueConstraint("content_item_id", "version", name="uq_content_version"),)


class AnalysisRun(Base, TimestampMixin):
    __tablename__ = "analysis_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    content_item_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    content_version_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="queued")  # queued|running|complete|failed
    model_provider: Mapped[str] = mapped_column(String(60), default="")
    model_name: Mapped[str] = mapped_column(String(120), default="")
    embedding_model: Mapped[str] = mapped_column(String(120), default="")
    prompt_version: Mapped[str] = mapped_column(String(60), default="")
    rule_versions: Mapped[list] = mapped_column(JSON, default=list)  # snapshot of rule keys+versions used
    repeat_runs: Mapped[int] = mapped_column(Integer, default=1)
    stats: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Finding(Base, TimestampMixin):
    __tablename__ = "findings"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    analysis_run_id: Mapped[str] = mapped_column(ForeignKey("analysis_runs.id"), index=True, nullable=False)
    content_item_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    content_version_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    reviewer: Mapped[str] = mapped_column(String(40), nullable=False)  # brand_voice|terminology|fact_checker|visual|accessibility|legal
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # low|medium|high|critical
    label: Mapped[str] = mapped_column(String(20), nullable=False)  # confirmed|possible
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    confidence_band: Mapped[str] = mapped_column(String(10), default="medium")
    human_review_required: Mapped[bool] = mapped_column(Boolean, default=False)
    span_start: Mapped[int] = mapped_column(Integer, default=0)
    span_end: Mapped[int] = mapped_column(Integer, default=0)
    span_text: Mapped[str] = mapped_column(Text, default="")
    block_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    issue: Mapped[str] = mapped_column(Text, nullable=False)
    why: Mapped[str] = mapped_column(Text, nullable=False)
    rule_quote: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {document, page, section, chunk_id, snippet}
    impact: Mapped[str] = mapped_column(Text, default="")
    suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)
    deterministic: Mapped[bool] = mapped_column(Boolean, default=False)
    rule_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    rule_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    rule_version_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    rule_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider: Mapped[str] = mapped_column(String(60), default="")
    model: Mapped[str] = mapped_column(String(120), default="")
    prompt_version: Mapped[str] = mapped_column(String(60), default="")
    agreement: Mapped[float] = mapped_column(Float, default=1.0)
    evidence_strength: Mapped[float] = mapped_column(Float, default=0.5)
    deterministic_backing: Mapped[float] = mapped_column(Float, default=0.0)
    dedupe_key: Mapped[str] = mapped_column(String(200), default="", index=True)
    decision_status: Mapped[str] = mapped_column(String(20), default="open")  # open|accepted|edited|dismissed|escalated


class Decision(Base, TimestampMixin):
    __tablename__ = "decisions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    finding_id: Mapped[str] = mapped_column(ForeignKey("findings.id"), index=True, nullable=False)
    actor_id: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # accept|edit|dismiss|escalate
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    edited_suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)
    manager_override: Mapped[bool] = mapped_column(Boolean, default=False)


class Override(Base, TimestampMixin):
    """A manager decision that disagrees with the AI's suggestion -> candidate rule change."""
    __tablename__ = "overrides"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    decision_id: Mapped[str] = mapped_column(ForeignKey("decisions.id"), index=True, nullable=False)
    finding_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    rule_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="awaiting_answer")  # awaiting_answer|declined|pending_approval|promoted|rejected
    scope_department: Mapped[str | None] = mapped_column(String(80), nullable=True)
    scope_content_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    scope_choice: Mapped[str | None] = mapped_column(String(24), nullable=True)  # global|department|content_type
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    manager_id: Mapped[str] = mapped_column(String(32), nullable=False)
    proposed_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    proposed_version_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    approval_required_from: Mapped[str | None] = mapped_column(String(40), nullable=True)
    regression: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class Comment(Base, TimestampMixin):
    __tablename__ = "comments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    content_item_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    content_version: Mapped[int] = mapped_column(Integer, default=1)
    author_id: Mapped[str] = mapped_column(String(32), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), default="internal")  # internal|external


class Approval(Base, TimestampMixin):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    content_item_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    content_version: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_id: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)  # approve|reject|request_changes
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditLog(Base):
    """Append-only. The API never exposes update/delete for this table."""
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(40), nullable=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity: Mapped[str] = mapped_column(String(60), default="")
    entity_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)
    prev_hash: Mapped[str] = mapped_column(String(64), default="")
    entry_hash: Mapped[str] = mapped_column(String(64), default="")


class RegressionRun(Base):
    """Result of re-running the labelled test set after a rule promotion."""
    __tablename__ = "regression_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    trigger: Mapped[str] = mapped_column(String(120), default="promotion")
    override_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    rule_versions: Mapped[list] = mapped_column(JSON, default=list)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    passed: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, nullable=False)


Index("ix_findings_run_reviewer", Finding.analysis_run_id, Finding.reviewer)
Index("ix_findings_org_rule", Finding.org_id, Finding.rule_key)
Index("ix_audit_org_created", AuditLog.org_id, AuditLog.created_at)
