"""Content items, versions, analysis trigger, findings decisions and approvals."""
from __future__ import annotations

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, Response, UploadFile, status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ratelimit
from ..audit import record
from ..config import settings
from ..db import get_db
from ..models import (
    AnalysisRun, Approval, Comment, ContentItem, ContentVersion, Decision, Finding, Organisation,
    Override, User,
)
from ..schemas import (
    AnalysisRunOut, ApprovalIn, CommentIn, ContentIn, ContentOut, ContentVersionOut, DecisionIn,
    FindingOut,
)
from ..security import Principal, current_user, get_owned
from ..services import workflows
from ..services.extraction import extract_pasted, extract_upload
from ..services.pipeline import execute_run, start_run
from ..storage import save_bytes

router = APIRouter(tags=["content"])


# --------------------------------------------------------------------------- #
def _can_see(principal: Principal, item: ContentItem) -> bool:
    if principal.is_manager_or_above:
        return True
    return item.owner_id == principal.user_id


def _version_out(version: ContentVersion) -> ContentVersionOut:
    return ContentVersionOut(
        id=version.id, version=version.version, body_text=version.body_text,
        blocks=version.blocks or [], filename=version.filename, mime=version.mime,
        author_id=version.author_id, notes=version.notes, created_at=version.created_at,
    )


def _item_out(db: Session, item: ContentItem) -> ContentOut:
    owner = db.get(User, item.owner_id)
    version = db.execute(select(ContentVersion).where(
        ContentVersion.content_item_id == item.id, ContentVersion.version == item.current_version
    )).scalars().first()
    latest_run = db.execute(select(AnalysisRun).where(AnalysisRun.content_item_id == item.id)
                            .order_by(AnalysisRun.created_at.desc())).scalars().first()
    return ContentOut(
        id=item.id, title=item.title, content_type=item.content_type, department=item.department,
        owner_id=item.owner_id, owner_name=owner.name if owner else None, status=item.status,
        current_version=item.current_version, created_at=item.created_at,
        submitted_at=item.submitted_at, active_run_id=latest_run.id if latest_run else None,
        version=_version_out(version) if version else None,
    )


def _new_item(db: Session, principal: Principal, *, title: str, content_type: str,
              department: str | None, extracted: dict, filename: str | None = None,
              mime: str | None = None, size: int = 0, storage_key: str | None = None,
              notes: str | None = None) -> tuple[ContentItem, ContentVersion]:
    item = ContentItem(org_id=principal.org_id, title=title[:300], content_type=content_type,
                       department=department or principal.department, owner_id=principal.user_id,
                       status="draft", current_version=1)
    db.add(item)
    db.flush()
    version = ContentVersion(
        org_id=principal.org_id, content_item_id=item.id, version=1,
        body_text=extracted["text"], blocks=extracted["blocks"], filename=filename, mime=mime,
        size_bytes=size, storage_key=storage_key, author_id=principal.user_id, notes=notes,
    )
    db.add(version)
    db.flush()
    record(db, org_id=principal.org_id, action="content.created", actor_id=principal.user_id,
           actor_role=principal.role, entity="content_item", entity_id=item.id,
           detail={"content_type": content_type, "title": item.title,
                   "injection_flag": extracted["injection"]["detected"]})
    return item, version


@router.post("/content", response_model=ContentOut, status_code=status.HTTP_201_CREATED)
def create_content(body: ContentIn, principal: Principal = Depends(current_user),
                   db: Session = Depends(get_db)):
    principal.require("content:create")
    if not (body.text or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Paste some text or attach a file.")
    extracted = extract_pasted(body.text or "")
    if body.image_width and body.image_height:
        extracted["blocks"].append({
            "id": "img1", "kind": "image", "text": f"[image {body.image_width}×{body.image_height}]",
            "page": 1, "meta": {"width": body.image_width, "height": body.image_height, "alt": None},
        })
        from ..services.extraction import blocks_to_text
        extracted["text"], extracted["blocks"] = blocks_to_text(extracted["blocks"])
    item, _version = _new_item(db, principal, title=body.title, content_type=body.content_type,
                               department=body.department, extracted=extracted)
    db.commit()
    return _item_out(db, item)


@router.post("/content/upload", response_model=ContentOut, status_code=status.HTTP_201_CREATED)
async def upload_content(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(...),
    content_type: str = Form("blog"),
    department: str | None = Form(None),
    alt: str | None = Form(None),
    principal: Principal = Depends(current_user),
    db: Session = Depends(get_db),
):
    principal.require("content:create")
    ratelimit.hit("upload", request, settings.upload_rate_limit_per_minute)
    if content_type not in ("social_post", "blog", "ad", "email"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown content type.")
    from .. import storage
    data, mime = await storage.read_upload(file)
    try:
        extracted = extract_upload(file.filename or "upload", mime, data, alt=alt)
    except ValueError as exc:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(exc)) from exc
    key = save_bytes(data, org_id=principal.org_id, prefix="content", filename=file.filename or "upload")
    item, _version = _new_item(db, principal, title=title, content_type=content_type,
                               department=department, extracted=extracted, filename=file.filename,
                               mime=mime, size=len(data), storage_key=key)
    db.commit()
    return _item_out(db, item)


@router.get("/content", response_model=list[ContentOut])
def list_content(mine: bool = False, principal: Principal = Depends(current_user),
                 db: Session = Depends(get_db)):
    q = select(ContentItem).where(ContentItem.org_id == principal.org_id,
                                  ContentItem.deleted_at.is_(None))
    if mine or not principal.is_manager_or_above or principal.role == "external_creator":
        q = q.where(ContentItem.owner_id == principal.user_id)
    items = db.execute(q.order_by(ContentItem.created_at.desc())).scalars().all()
    return [_item_out(db, i) for i in items]


@router.get("/content/{item_id}", response_model=ContentOut)
def get_content(item_id: str, principal: Principal = Depends(current_user),
                db: Session = Depends(get_db)):
    item = get_owned(db, ContentItem, item_id, principal)
    if not _can_see(principal, item):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own content.")
    return _item_out(db, item)


@router.get("/content/{item_id}/report.pdf")
def review_report_pdf(item_id: str, run_id: str | None = None,
                      principal: Principal = Depends(current_user),
                      db: Session = Depends(get_db)):
    """The review record as a PDF, generated server-side.

    Same facts as the screen — rule, citation, confidence, decision — and the
    disclaimer on every page, because a PDF is the artefact that leaves the app.
    """
    item = get_owned(db, ContentItem, item_id, principal)
    if not _can_see(principal, item):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own content.")

    version = db.execute(select(ContentVersion).where(
        ContentVersion.content_item_id == item.id, ContentVersion.version == item.current_version
    )).scalars().first()
    query = select(AnalysisRun).where(AnalysisRun.content_item_id == item.id)
    if run_id:
        query = query.where(AnalysisRun.id == run_id)
    else:
        query = query.where(AnalysisRun.status == "complete")
    run = db.execute(query.order_by(AnalysisRun.created_at.desc())).scalars().first()
    if run is None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This content has no completed review to export.")

    findings = db.execute(
        select(Finding).where(Finding.analysis_run_id == run.id)
        .order_by(Finding.span_start)
    ).scalars().all()
    owner = db.get(User, item.owner_id)
    org = db.get(Organisation, principal.org_id)

    from ..services.pdf import review_pdf

    pdf = review_pdf(
        item={
            "title": item.title, "owner_name": owner.name if owner else None,
            "department": item.department, "content_type": item.content_type,
            "current_version": item.current_version, "status": item.status,
            "body_text": version.body_text if version else "",
        },
        run={
            "model_provider": run.model_provider, "model_name": run.model_name,
            "embedding_model": run.embedding_model, "prompt_version": run.prompt_version,
            "repeat_runs": run.repeat_runs, "metrics": run.metrics or {},
        },
        findings=[finding_out(f).model_dump() for f in findings],
        organisation=org.name if org else "Sentinel",
    )
    safe_title = "".join(c for c in (item.title or "review") if c.isalnum() or c in " -_")[:60].strip()
    filename = f"{(safe_title or 'review').replace(' ', '-').lower()}-review.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"content-disposition": f'inline; filename="{filename}"'})


@router.get("/content/{item_id}/versions", response_model=list[ContentVersionOut])
def list_versions(item_id: str, principal: Principal = Depends(current_user),
                  db: Session = Depends(get_db)):
    item = get_owned(db, ContentItem, item_id, principal)
    if not _can_see(principal, item):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own content.")
    rows = db.execute(select(ContentVersion).where(ContentVersion.content_item_id == item.id)
                      .order_by(ContentVersion.version.desc())).scalars().all()
    return [_version_out(v) for v in rows]


@router.post("/content/{item_id}/versions", response_model=ContentOut, status_code=status.HTTP_201_CREATED)
def add_version(item_id: str, body: ContentIn, principal: Principal = Depends(current_user),
                db: Session = Depends(get_db)):
    item = get_owned(db, ContentItem, item_id, principal)
    if item.owner_id != principal.user_id and not principal.is_manager_or_above:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or a manager can add a version.")
    if not (body.text or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A new version needs text.")
    extracted = extract_pasted(body.text or "")
    item.current_version += 1
    item.status = "draft"
    db.add(ContentVersion(org_id=principal.org_id, content_item_id=item.id, version=item.current_version,
                          body_text=extracted["text"], blocks=extracted["blocks"],
                          author_id=principal.user_id, notes=body.title or None))
    record(db, org_id=principal.org_id, action="content.version_added", actor_id=principal.user_id,
           actor_role=principal.role, entity="content_item", entity_id=item.id,
           detail={"version": item.current_version})
    db.commit()
    return _item_out(db, item)


# --------------------------------------------------------------------------- #
# analysis
# --------------------------------------------------------------------------- #
@router.post("/content/{item_id}/analyze", response_model=AnalysisRunOut,
             status_code=status.HTTP_202_ACCEPTED)
def analyze(item_id: str, background: BackgroundTasks,
            principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("analysis:run")
    item = get_owned(db, ContentItem, item_id, principal)
    if item.owner_id != principal.user_id and not principal.is_manager_or_above:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only analyse your own content.")
    version = db.execute(select(ContentVersion).where(
        ContentVersion.content_item_id == item.id, ContentVersion.version == item.current_version
    )).scalars().first()
    if version is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Content has no version to analyse.")
    # a previous run on this org that never finished must not block the new one
    from ..services.pipeline import recover_stale_runs

    recover_stale_runs(db, org_id=principal.org_id)
    run = start_run(db, org_id=principal.org_id, item=item, version=version)
    record(db, org_id=principal.org_id, action="analysis.started", actor_id=principal.user_id,
           actor_role=principal.role, entity="analysis_run", entity_id=run.id,
           detail={"content_item_id": item.id, "version": version.version})
    db.commit()
    background.add_task(execute_run, run.id)
    return AnalysisRunOut(
        id=run.id, status=run.status, content_item_id=run.content_item_id,
        content_version_id=run.content_version_id, model_provider=run.model_provider,
        model_name=run.model_name, embedding_model=run.embedding_model,
        prompt_version=run.prompt_version, repeat_runs=run.repeat_runs,
    )


# --------------------------------------------------------------------------- #
# findings
# --------------------------------------------------------------------------- #
def finding_out(f: Finding) -> FindingOut:
    return FindingOut(
        id=f.id, reviewer=f.reviewer, category=f.category, severity=f.severity, label=f.label,
        confidence=f.confidence, confidence_band=f.confidence_band,
        human_review_required=f.human_review_required, span_start=f.span_start, span_end=f.span_end,
        span_text=f.span_text, block_id=f.block_id, issue=f.issue, why=f.why,
        rule_quote=f.rule_quote, rule_key=f.rule_key, rule_version=f.rule_version,
        evidence=f.evidence, impact=f.impact,
        suggestion=f.suggestion if f.decision_status != "dismissed" else None,
        deterministic=f.deterministic, provider=f.provider, model=f.model,
        prompt_version=f.prompt_version, agreement=f.agreement,
        evidence_strength=f.evidence_strength, metrics=f.metrics or {},
        decision_status=f.decision_status,
    )


@router.post("/findings/{finding_id}/decision")
def decide_finding(finding_id: str, body: DecisionIn,
                   principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("decision:make")
    finding = get_owned(db, Finding, finding_id, principal)
    decision, override = workflows.decide_on_finding(
        db, finding, principal, action=body.action, reason=body.reason,
        edited_suggestion=body.edited_suggestion,
    )
    db.commit()
    return {
        "decision_id": decision.id, "action": decision.action,
        "finding_status": finding.decision_status,
        "learning_prompt": (
            {
                "override_id": override.id,
                "question": "Make this an approved rule?",
                "options": [
                    {"value": "yes", "label": "Yes"},
                    {"value": "no", "label": "No"},
                    {"value": "scoped", "label": "Yes, for one department or content type only"},
                ],
                "requires_approver": finding.category in ("legal", "accessibility"),
            } if override else None
        ),
    }


@router.get("/findings")
def list_findings(content_item_id: str | None = None, severity: str | None = None,
                  principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Finding).where(Finding.org_id == principal.org_id)
    if content_item_id:
        q = q.where(Finding.content_item_id == content_item_id)
    if severity:
        q = q.where(Finding.severity == severity)
    rows = db.execute(q.order_by(Finding.created_at.desc()).limit(200)).scalars().all()
    return [finding_out(f) for f in rows]


# --------------------------------------------------------------------------- #
# workflow: comments, submit, approve
# --------------------------------------------------------------------------- #
@router.get("/content/{item_id}/comments")
def list_comments(item_id: str, principal: Principal = Depends(current_user),
                  db: Session = Depends(get_db)):
    item = get_owned(db, ContentItem, item_id, principal)
    if not _can_see(principal, item):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own content.")
    rows = db.execute(select(Comment).where(Comment.content_item_id == item.id)
                      .order_by(Comment.created_at.asc())).scalars().all()
    if principal.role == "external_creator":
        rows = [c for c in rows if c.visibility == "external"]
    out = []
    for c in rows:
        author = db.get(User, c.author_id)
        out.append({"id": c.id, "body": c.body, "author": author.name if author else "Unknown",
                    "author_role": author.role if author else "", "visibility": c.visibility,
                    "version": c.content_version, "created_at": c.created_at})
    return out


@router.post("/content/{item_id}/comments", status_code=status.HTTP_201_CREATED)
def add_comment(item_id: str, body: CommentIn, principal: Principal = Depends(current_user),
                db: Session = Depends(get_db)):
    item = get_owned(db, ContentItem, item_id, principal)
    if not _can_see(principal, item):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only comment on your own content.")
    comment = workflows.add_comment(db, item, principal, body=body.body, visibility=body.visibility)
    db.commit()
    return {"id": comment.id, "body": comment.body}


@router.post("/content/{item_id}/submit", response_model=ContentOut)
def submit(item_id: str, body: CommentIn | None = None,
           principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    item = get_owned(db, ContentItem, item_id, principal)
    workflows.submit_for_approval(db, item, principal, note=body.body if body else None)
    db.commit()
    return _item_out(db, item)


@router.post("/content/{item_id}/approve", response_model=ContentOut)
def approve(item_id: str, body: ApprovalIn, principal: Principal = Depends(current_user),
            db: Session = Depends(get_db)):
    item = get_owned(db, ContentItem, item_id, principal)
    workflows.decide(db, item, principal, action=body.action, reason=body.reason,
                     version_number=body.version)
    db.commit()
    return _item_out(db, item)


@router.get("/content/{item_id}/approvals")
def list_approvals(item_id: str, principal: Principal = Depends(current_user),
                   db: Session = Depends(get_db)):
    item = get_owned(db, ContentItem, item_id, principal)
    rows = db.execute(select(Approval).where(Approval.content_item_id == item.id)
                      .order_by(Approval.decided_at.desc())).scalars().all()
    out = []
    for a in rows:
        actor = db.get(User, a.actor_id)
        out.append({"id": a.id, "action": a.action, "actor": actor.name if actor else "Unknown",
                    "actor_role": actor.role if actor else "", "version": a.content_version,
                    "reason": a.reason, "decided_at": a.decided_at})
    return out


@router.get("/content/{item_id}/timeline")
def timeline(item_id: str, principal: Principal = Depends(current_user),
             db: Session = Depends(get_db)):
    """Version history + decisions + comments in one ordered list."""
    item = get_owned(db, ContentItem, item_id, principal)
    events: list[dict] = []
    for v in db.execute(select(ContentVersion).where(ContentVersion.content_item_id == item.id)).scalars():
        author = db.get(User, v.author_id)
        events.append({"at": v.created_at, "kind": "version", "version": v.version,
                       "actor": author.name if author else "", "detail": v.notes or "Version created"})
    for a in db.execute(select(Approval).where(Approval.content_item_id == item.id)).scalars():
        actor = db.get(User, a.actor_id)
        events.append({"at": a.decided_at, "kind": "approval", "version": a.content_version,
                       "actor": actor.name if actor else "", "detail": f"{a.action}: {a.reason or ''}".strip()})
    for c in db.execute(select(Comment).where(Comment.content_item_id == item.id)).scalars():
        author = db.get(User, c.author_id)
        events.append({"at": c.created_at, "kind": "comment", "version": c.content_version,
                       "actor": author.name if author else "", "detail": c.body})
    events.sort(key=lambda e: e["at"])
    return {"item_id": item.id, "status": item.status, "events": events}


@router.delete("/content/{item_id}")
def delete_content(item_id: str, principal: Principal = Depends(current_user),
                   db: Session = Depends(get_db)):
    item = get_owned(db, ContentItem, item_id, principal)
    if item.owner_id != principal.user_id and principal.role not in ("admin", "brand_manager"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or a brand manager can delete this.")
    from datetime import datetime, timezone
    item.deleted_at = datetime.now(timezone.utc)
    record(db, org_id=principal.org_id, action="content.deleted", actor_id=principal.user_id,
           actor_role=principal.role, entity="content_item", entity_id=item.id,
           detail={"title": item.title})
    db.commit()
    return {"deleted": True, "id": item.id}


@router.get("/analysis-runs/{run_id}", response_model=AnalysisRunOut)
def get_run(run_id: str, principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    run = get_owned(db, AnalysisRun, run_id, principal)
    findings = db.execute(select(Finding).where(Finding.analysis_run_id == run.id)
                          .order_by(Finding.confidence.desc())).scalars().all()
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings = sorted(findings, key=lambda f: (order.get(f.severity, 9), -f.confidence))
    return AnalysisRunOut(
        id=run.id, status=run.status, content_item_id=run.content_item_id,
        content_version_id=run.content_version_id, model_provider=run.model_provider,
        model_name=run.model_name, embedding_model=run.embedding_model,
        prompt_version=run.prompt_version, repeat_runs=run.repeat_runs, stats=run.stats or {},
        metrics=run.metrics or {},
        rule_versions=run.rule_versions or [], error=run.error, started_at=run.started_at,
        finished_at=run.finished_at, findings=[finding_out(f) for f in findings],
    )


@router.get("/content/{item_id}/runs", response_model=list[AnalysisRunOut])
def list_runs(item_id: str, principal: Principal = Depends(current_user),
              db: Session = Depends(get_db)):
    item = get_owned(db, ContentItem, item_id, principal)
    rows = db.execute(select(AnalysisRun).where(AnalysisRun.content_item_id == item.id)
                      .order_by(AnalysisRun.created_at.desc())).scalars().all()
    return [AnalysisRunOut(
        id=r.id, status=r.status, content_item_id=r.content_item_id,
        content_version_id=r.content_version_id, model_provider=r.model_provider,
        model_name=r.model_name, embedding_model=r.embedding_model,
        prompt_version=r.prompt_version, repeat_runs=r.repeat_runs, stats=r.stats or {},
        rule_versions=r.rule_versions or [], error=r.error, started_at=r.started_at,
        finished_at=r.finished_at) for r in rows]
