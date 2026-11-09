"""API request/response schemas, plus the strict contract every reviewer must satisfy."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

ReviewerName = Literal["brand_voice", "terminology", "fact_checker", "visual", "accessibility", "legal"]
Severity = Literal["low", "medium", "high", "critical"]
Label = Literal["confirmed", "possible"]
ConfidenceBand = Literal["low", "medium", "high"]


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class LoginIn(BaseModel):
    email: str
    password: str


class WorkspaceSetupIn(BaseModel):
    org_name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9\-]+$")
    admin_name: str
    admin_email: str
    admin_password: str = Field(min_length=8)
    departments: list[str] = ["Marketing", "Product", "Sales", "Support"]


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    department: Optional[str] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    organisation: dict


# --------------------------------------------------------------------------- #
# Brand Kit
# --------------------------------------------------------------------------- #
class BrandKitIn(BaseModel):
    name: str = "Brand Kit"
    version: int = 1


class BrandKitOut(BaseModel):
    id: str
    name: str
    version: int
    status: str
    documents: int = 0
    rules: int = 0
    terms: int = 0
    facts: int = 0
    assets: int = 0


class RuleOut(BaseModel):
    id: str
    key: str
    category: str
    check_type: str
    requires_approver: bool
    current_version: int
    active: bool
    version_id: Optional[str] = None
    version: int = 1
    title: str = ""
    body: str = ""
    scope_department: Optional[str] = None
    scope_content_type: Optional[str] = None
    status: str = "active"
    author_name: Optional[str] = None
    reason: Optional[str] = None
    source_document: Optional[str] = None
    source_page: Optional[int] = None
    source_section: Optional[str] = None
    created_at: Optional[datetime] = None


class RuleVersionOut(RuleOut):
    rule_id: str
    is_current: bool = True


class TermOut(BaseModel):
    id: str
    kind: str
    value: str
    replacement: Optional[str] = None
    severity: str
    note: Optional[str] = None
    status: str
    rule_key: Optional[str] = None


class FactOut(BaseModel):
    id: str
    statement: str
    value: Optional[str] = None
    topic: Optional[str] = None
    status: str
    source_document: Optional[str] = None
    source_page: Optional[int] = None


class AssetOut(BaseModel):
    id: str
    kind: str
    name: str
    value: str
    version: Optional[str] = None
    status: str
    meta: dict = {}


class DocumentOut(BaseModel):
    id: str
    filename: str
    mime: str
    kind: str
    version: int
    pages: int
    size_bytes: int
    status: str
    created_at: datetime
    chunks: int = 0


class ConfirmIn(BaseModel):
    ids: list[str]
    action: Literal["confirm", "reject"] = "confirm"


class RuleUpdateIn(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    scope_department: Optional[str] = None
    scope_content_type: Optional[str] = None
    reason: Optional[str] = None


# --------------------------------------------------------------------------- #
# Content
# --------------------------------------------------------------------------- #
class ContentIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content_type: Literal["social_post", "blog", "ad", "email"]
    department: Optional[str] = None
    text: Optional[str] = None
    image_width: Optional[int] = None
    image_height: Optional[int] = None


class BlockOut(BaseModel):
    id: str
    kind: str
    text: str = ""
    page: int = 1
    style: Optional[str] = None
    start: int = 0
    end: int = 0
    meta: dict = {}


class ContentVersionOut(BaseModel):
    id: str
    version: int
    body_text: str
    blocks: list[BlockOut] = []
    filename: Optional[str] = None
    mime: Optional[str] = None
    author_id: str
    notes: Optional[str] = None
    created_at: datetime


class ContentOut(BaseModel):
    id: str
    title: str
    content_type: str
    department: Optional[str] = None
    owner_id: str
    owner_name: Optional[str] = None
    status: str
    current_version: int
    created_at: datetime
    submitted_at: Optional[datetime] = None
    active_run_id: Optional[str] = None
    version: Optional[ContentVersionOut] = None


# --------------------------------------------------------------------------- #
# Findings / analysis
# --------------------------------------------------------------------------- #
class EvidenceRef(BaseModel):
    document: str
    page: Optional[int] = None
    section: Optional[str] = None
    chunk_id: Optional[str] = None
    snippet: Optional[str] = None


class ReviewerFinding(BaseModel):
    """The strict JSON shape each reviewer must return. Validated with Pydantic."""
    reviewer: ReviewerName
    span_start: int = Field(ge=0)
    span_end: int = Field(ge=0)
    span_text: str
    issue: str = Field(min_length=3)
    why: str = Field(min_length=3)
    evidence_ref: Optional[EvidenceRef] = None
    impact: str = Field(min_length=3)
    severity: Severity
    suggestion: Optional[str] = None
    rule_key: Optional[str] = None
    category: Optional[str] = None
    deterministic: bool = False
    direct_contradiction: bool = False
    evidence_strength: float = Field(default=0.5, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def _check_span(self):
        if self.span_end < self.span_start:
            raise ValueError("span_end must be >= span_start")
        return self

    @field_validator("suggestion")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


class ReviewerOutput(BaseModel):
    reviewer: ReviewerName
    findings: list[ReviewerFinding] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class FindingOut(BaseModel):
    id: str
    reviewer: str
    category: str
    severity: str
    label: str
    confidence: float
    confidence_band: str
    human_review_required: bool
    span_start: int
    span_end: int
    span_text: str
    block_id: Optional[str] = None
    issue: str
    why: str
    rule_quote: Optional[str] = None
    rule_key: Optional[str] = None
    rule_version: Optional[int] = None
    evidence: Optional[dict] = None
    impact: str
    suggestion: Optional[str] = None
    deterministic: bool
    provider: str
    model: str
    prompt_version: str
    agreement: float
    evidence_strength: float
    decision_status: str


class AnalysisRunOut(BaseModel):
    id: str
    status: str
    content_item_id: str
    content_version_id: str
    model_provider: str
    model_name: str
    embedding_model: str
    prompt_version: str
    repeat_runs: int
    stats: dict = {}
    rule_versions: list = []
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    findings: list[FindingOut] = []


class DecisionIn(BaseModel):
    action: Literal["accept", "edit", "dismiss", "escalate"]
    reason: Optional[str] = None
    edited_suggestion: Optional[str] = None

    @model_validator(mode="after")
    def _reason_required(self):
        if self.action in ("dismiss", "escalate") and not (self.reason or "").strip():
            raise ValueError("A reason is required when dismissing or escalating.")
        return self


# --------------------------------------------------------------------------- #
# Workflow
# --------------------------------------------------------------------------- #
class CommentIn(BaseModel):
    body: str = Field(min_length=1)
    visibility: Literal["internal", "external"] = "internal"


class ApprovalIn(BaseModel):
    action: Literal["approve", "reject", "request_changes"]
    reason: Optional[str] = None
    version: Optional[int] = None


class OverrideAnswerIn(BaseModel):
    """The learning prompt: 'Make this an approved rule?'"""
    make_rule: bool
    scope: Literal["global", "department", "content_type"] = "global"
    department: Optional[str] = None
    content_type: Optional[str] = None
    reason: Optional[str] = None


class PromoteIn(BaseModel):
    approver_note: Optional[str] = None


# --------------------------------------------------------------------------- #
# Analytics / audit
# --------------------------------------------------------------------------- #
class AnalyticsSummaryOut(BaseModel):
    brand_score: float
    formula: str
    window_days: int
    submissions: int
    findings_by_severity: dict
    findings_by_reviewer: dict
    most_common_mistakes: list
    department_compliance: list
    average_approval_hours: Optional[float]
    repeated_violations: list
    brand_health_trend: list
    top_violated_guideline: Optional[dict]
    inputs: dict = {}
    monthly_report: dict
    provider: dict
