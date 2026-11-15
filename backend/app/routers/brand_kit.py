"""Brand Kit: kits, documents, extraction, proposed rules/terms/facts, assets, rules."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record
from ..db import get_db
from ..llm.factory import get_adapter, provider_info
from ..models import (Asset, BrandKit, Chunk, Document, Fact, Rule, RuleReviewTask, RuleVersion,
                      Term, User)
from ..schemas import (
    AssetOut, BrandKitIn, BrandKitOut, ConfirmIn, DocumentOut, FactOut, RuleOut, RuleUpdateIn,
    RuleVersionOut, TermOut,
)
from ..security import Principal, current_user, get_owned
from ..services.extraction import blocks_to_text, extract_upload
from ..services.retrieval import ingest_document
from ..services.workflows import revert_rule_version
from ..storage import delete_bytes, read_bytes, save_bytes, sha256
from .. import storage

log = logging.getLogger("sentinel.brandkit")
router = APIRouter(tags=["brand-kit"])


# --------------------------------------------------------------------------- #
# kits
# --------------------------------------------------------------------------- #
@router.post("/brand-kits", response_model=BrandKitOut, status_code=status.HTTP_201_CREATED)
def create_kit(body: BrandKitIn, principal: Principal = Depends(current_user),
               db: Session = Depends(get_db)):
    principal.require("brand_kit:write")
    kit = BrandKit(org_id=principal.org_id, name=body.name, version=body.version,
                   status="draft", created_by=principal.user_id)
    db.add(kit)
    db.flush()
    record(db, org_id=principal.org_id, action="brand_kit.created", actor_id=principal.user_id,
           actor_role=principal.role, entity="brand_kit", entity_id=kit.id, detail={"name": kit.name})
    db.commit()
    return BrandKitOut(id=kit.id, name=kit.name, version=kit.version, status=kit.status)


def _active_kit(db: Session, org_id: str) -> BrandKit:
    kit = db.execute(select(BrandKit).where(BrandKit.org_id == org_id)
                     .order_by(BrandKit.status.desc(), BrandKit.version.desc())).scalars().first()
    if kit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No Brand Kit yet. Create one first.")
    return kit


@router.get("/brand-kits", response_model=list[BrandKitOut])
def list_kits(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("brand_kit:read")
    kits = db.execute(select(BrandKit).where(BrandKit.org_id == principal.org_id)).scalars().all()
    out = []
    for kit in kits:
        out.append(BrandKitOut(
            id=kit.id, name=kit.name, version=kit.version, status=kit.status,
            documents=len(db.execute(select(Document).where(Document.brand_kit_id == kit.id,
                                                            Document.status != "deleted")).scalars().all()),
            rules=len(db.execute(select(Rule).where(Rule.brand_kit_id == kit.id,
                                                    Rule.active.is_(True))).scalars().all()),
            terms=len(db.execute(select(Term).where(Term.brand_kit_id == kit.id,
                                                    Term.status == "confirmed")).scalars().all()),
            facts=len(db.execute(select(Fact).where(Fact.brand_kit_id == kit.id,
                                                    Fact.status == "confirmed")).scalars().all()),
            assets=len(db.execute(select(Asset).where(Asset.brand_kit_id == kit.id)).scalars().all()),
        ))
    return out


@router.post("/brand-kits/{kit_id}/activate", response_model=BrandKitOut)
def activate_kit(kit_id: str, principal: Principal = Depends(current_user),
                 db: Session = Depends(get_db)):
    principal.require("brand_kit:write")
    kit = get_owned(db, BrandKit, kit_id, principal)
    for other in db.execute(select(BrandKit).where(BrandKit.org_id == principal.org_id)).scalars():
        other.status = "archived" if other.id != kit.id and other.status == "active" else other.status
    kit.status = "active"
    record(db, org_id=principal.org_id, action="brand_kit.activated", actor_id=principal.user_id,
           actor_role=principal.role, entity="brand_kit", entity_id=kit.id)
    db.commit()
    return BrandKitOut(id=kit.id, name=kit.name, version=kit.version, status=kit.status)


# --------------------------------------------------------------------------- #
# documents + ingestion
# --------------------------------------------------------------------------- #
@router.post("/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    kind: str = Form("guideline"),
    brand_kit_id: str | None = Form(None),
    replaces_document_id: str | None = Form(None),
    principal: Principal = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Upload a guideline PDF/DOCX/logo, extract, chunk (300-500 tokens), embed, propose rules."""
    principal.require("brand_kit:write")
    if kind not in ("guideline", "legal", "term_list", "approved_facts", "other", "logo"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown document kind.")

    data, mime = await storage.read_upload(file)
    kit = get_owned(db, BrandKit, brand_kit_id, principal) if brand_kit_id else _active_kit(db, principal.org_id)

    # Version lineage. A guideline is uploaded again and again; before this, every
    # one of those uploads was called "version 1" and the previous text was lost to
    # comparison. `replaces_document_id` names the version being replaced; without
    # it, the same kind + filename in this kit is treated as the predecessor.
    previous = _predecessor(db, principal, kit, kind=kind,
                            filename=file.filename or "upload",
                            replaces_document_id=replaces_document_id)
    version = (previous.version + 1) if previous else 1
    lineage = list((previous.meta or {}).get("lineage") or []) if previous else []
    if previous:
        lineage.append({"document_id": previous.id, "version": previous.version,
                        "filename": previous.filename})

    doc = Document(org_id=principal.org_id, brand_kit_id=kit.id, filename=file.filename or "upload",
                   mime=mime, size_bytes=len(data), sha256=sha256(data), kind=kind,
                   storage_key=save_bytes(data, org_id=principal.org_id, prefix="documents",
                                          filename=file.filename or "upload"),
                   version=version,
                   meta={"lineage": lineage,
                         "replaces_document_id": previous.id if previous else None,
                         "replaces_version": previous.version if previous else None})
    db.add(doc)
    db.flush()
    if previous:
        previous.meta = {**(previous.meta or {}), "superseded_by": doc.id,
                         "superseded_by_version": version}
        db.flush()

    if kind == "logo" or mime.startswith("image/"):
        doc.status = "extracted"
        db.add(Asset(org_id=principal.org_id, brand_kit_id=kit.id, kind="logo",
                     name=file.filename or "logo", value=doc.storage_key, version="pending",
                     status="proposed", storage_key=doc.storage_key,
                     meta={"document_id": doc.id, "mime": mime}))
        record(db, org_id=principal.org_id, action="document.uploaded", actor_id=principal.user_id,
               actor_role=principal.role, entity="document", entity_id=doc.id,
               detail={"kind": kind, "mime": mime, "bytes": len(data)})
        db.commit()
        return DocumentOut(id=doc.id, filename=doc.filename, mime=doc.mime, kind=doc.kind,
                           version=doc.version, pages=0, size_bytes=doc.size_bytes,
                           status=doc.status, created_at=doc.created_at)

    try:
        extracted = extract_upload(doc.filename, mime, data)
    except Exception as exc:
        doc.status = "failed"
        db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"Could not extract text: {type(exc).__name__}") from exc

    doc.pages = extracted["pages"]
    doc.meta = {**(doc.meta or {}), "tokens": extracted["tokens"],
                "injection": extracted["injection"], "blocks": len(extracted["blocks"]),
                # The extracted text is kept so the *next* upload can be diffed against
                # it section by section. Chunks are for retrieval, not for diffing: they
                # are split on token count and lose the headings that define a section.
                "text": extracted["text"][:200_000]}
    page_map = _page_map(extracted["blocks"])
    chunks = ingest_document(db, org_id=principal.org_id, document=doc,
                             text=extracted["text"], page_map=page_map)
    doc.status = "extracted"

    proposals = get_adapter().propose_rules(extracted["text"], {"kind": kind})
    _store_proposals(db, principal, kit, doc, proposals, kind)

    # C1/C2: what changed against the version this replaces, and which rules are now
    # standing on text that has changed or gone. Nothing here alters a rule: the diff
    # only creates review tasks, and a task waits for an Admin.
    diff_summary = None
    if previous is not None:
        from ..services.guideline_changes import record_change
        from ..services.guideline_diff import diff_documents

        try:
            previous_text = _document_text(db, previous)
            sections = diff_documents(previous_text, extracted["text"])
            diff_summary = record_change(db, org_id=principal.org_id, principal=principal,
                                         previous=previous, current=doc, sections=sections)
        except Exception as exc:  # a diff must never block an upload
            log.warning("guideline diff failed for %s: %s", doc.id, type(exc).__name__)
            diff_summary = {"error": type(exc).__name__}

    record(db, org_id=principal.org_id, action="document.uploaded", actor_id=principal.user_id,
           actor_role=principal.role, entity="document", entity_id=doc.id,
           detail={"kind": kind, "mime": mime, "bytes": len(data), "chunks": len(chunks),
                   "proposed_rules": len(proposals.get("rules", [])),
                   "injection_flag": extracted["injection"]["detected"]})
    db.commit()
    out = DocumentOut(id=doc.id, filename=doc.filename, mime=doc.mime, kind=doc.kind,
                      version=doc.version, pages=doc.pages, size_bytes=doc.size_bytes,
                      status=doc.status, created_at=doc.created_at, chunks=len(chunks))
    if diff_summary is not None:
        out.replaces_document_id = (doc.meta or {}).get("replaces_document_id")
        out.change_id = diff_summary.get("change_id")
        out.review_tasks = diff_summary.get("tasks", 0)
    return out


def _predecessor(db: Session, principal: Principal, kit: BrandKit, *, kind: str, filename: str,
                 replaces_document_id: str | None) -> Document | None:
    """The document this upload supersedes, if any."""
    if replaces_document_id:
        return get_owned(db, Document, replaces_document_id, principal)
    return db.execute(
        select(Document).where(Document.org_id == principal.org_id,
                               Document.brand_kit_id == kit.id,
                               Document.kind == kind,
                               Document.filename == filename,
                               Document.status != "deleted")
        .order_by(Document.version.desc(), Document.created_at.desc())
    ).scalars().first()


def _document_text(db: Session, doc: Document) -> str:
    """The text a version will be diffed by: the stored extraction, else its chunks.

    Chunks are the retrieval record, but they are cut on token counts and lose the
    heading that tells you which section you are in — so a diff built from them sees
    one anonymous blob. The extraction is stored at upload for exactly this purpose.
    """
    stored = (doc.meta or {}).get("text")
    if stored:
        return stored
    rows = db.execute(select(Chunk).where(Chunk.document_id == doc.id)
                      .order_by(Chunk.ordinal)).scalars().all()
    return "\n\n".join(c.text for c in rows)


def _page_map(blocks: list[dict]) -> list[dict]:
    return [{"start": b["start"], "end": b["end"], "page": b.get("page", 1)} for b in blocks]


def _norm(text: str | None) -> str:
    """Loose comparison key so re-extracting the same guideline does not duplicate rows."""
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def _store_proposals(db: Session, principal: Principal, kit: BrandKit, doc: Document,
                     proposals: dict, kind: str) -> None:
    """Store AI candidates as *proposed* rows. Nothing here is live until an Admin confirms it.

    Candidates that already exist in the kit (same title/body, same term, same fact) are
    skipped, so uploading or re-extracting the same document is idempotent instead of
    filling the review queue with duplicates.
    """
    existing_keys = {k for k in db.execute(
        select(Rule.key).where(Rule.org_id == principal.org_id)).scalars().all()}
    known_rules = {_norm(t) for t in db.execute(
        select(RuleVersion.title).join(Rule, Rule.id == RuleVersion.rule_id)
        .where(Rule.org_id == principal.org_id)).scalars().all()}
    known_rule_bodies = {_norm(b) for b in db.execute(
        select(RuleVersion.body).join(Rule, Rule.id == RuleVersion.rule_id)
        .where(Rule.org_id == principal.org_id)).scalars().all()}
    known_terms = {(_norm(t.kind), _norm(t.value)) for t in db.execute(
        select(Term).where(Term.org_id == principal.org_id)).scalars().all()}
    known_facts = {_norm(f.statement) for f in db.execute(
        select(Fact).where(Fact.org_id == principal.org_id)).scalars().all()}

    for item in proposals.get("rules", []):
        title, body = _norm(item.get("title")), _norm(item.get("body"))
        if not body or body in known_rule_bodies or title in known_rules:
            continue
        known_rule_bodies.add(body)
        known_rules.add(title)
        key = _unique_key(item.get("key_hint") or "RULE-GEN", existing_keys)
        category = item.get("category") or "brand_voice"
        rule = Rule(org_id=principal.org_id, brand_kit_id=kit.id, key=key, category=category,
                    check_type=item.get("check_type") or "both",
                    requires_approver=bool(item.get("requires_approver")) or category in ("legal", "accessibility"),
                    # inactive until an Admin confirms: an unconfirmed proposal must never
                    # be used by a review or counted as part of the kit
                    current_version=1, active=False)
        db.add(rule)
        db.flush()
        db.add(RuleVersion(
            org_id=principal.org_id, rule_id=rule.id, version=1,
            title=(item.get("title") or "Proposed rule")[:300],
            body=(item.get("body") or "")[:900], status="proposed",
            source_document_id=doc.id, source_page=1,
            source_section=item.get("source_section") or doc.filename,
            reason=f"Proposed by the AI from {doc.filename}; awaiting Admin confirmation.",
        ))
    for item in proposals.get("terms", []):
        kind_, value = _norm(item.get("kind") or "banned"), _norm(item.get("value"))
        if not value or (kind_, value) in known_terms:
            continue
        known_terms.add((kind_, value))
        db.add(Term(org_id=principal.org_id, brand_kit_id=kit.id, kind=item.get("kind") or "banned",
                    value=(item.get("value") or "")[:200], replacement=item.get("replacement"),
                    severity=item.get("severity") or "medium", note=item.get("note"),
                    status="proposed"))
    for item in proposals.get("facts", []):
        statement = _norm(item.get("statement"))
        if not statement or statement in known_facts:
            continue
        known_facts.add(statement)
        db.add(Fact(org_id=principal.org_id, brand_kit_id=kit.id,
                    statement=(item.get("statement") or "")[:500], value=item.get("value"),
                    topic=item.get("topic"), source_document_id=doc.id, source_page=1,
                    status="proposed"))


def _unique_key(hint: str, existing: set[str]) -> str:
    base = hint.upper()[:28]
    key, i = base, 2
    while key in existing:
        key = f"{base}-{i}"
        i += 1
    existing.add(key)
    return key


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("brand_kit:read")
    docs = db.execute(select(Document).where(Document.org_id == principal.org_id,
                                             Document.status != "deleted")
                      .order_by(Document.created_at.desc())).scalars().all()
    out = []
    for doc in docs:
        chunks = db.execute(select(Chunk).where(Chunk.document_id == doc.id)).scalars().all()
        out.append(DocumentOut(id=doc.id, filename=doc.filename, mime=doc.mime, kind=doc.kind,
                               version=doc.version, pages=doc.pages, size_bytes=doc.size_bytes,
                               status=doc.status, created_at=doc.created_at, chunks=len(chunks)))
    return out


@router.delete("/documents/{doc_id}", status_code=status.HTTP_200_OK)
def delete_document(doc_id: str, principal: Principal = Depends(current_user),
                    db: Session = Depends(get_db)):
    principal.require("brand_kit:write")
    doc = get_owned(db, Document, doc_id, principal)
    for chunk in db.execute(select(Chunk).where(Chunk.document_id == doc.id)).scalars():
        db.delete(chunk)
    delete_bytes(doc.storage_key)
    doc.status = "deleted"
    record(db, org_id=principal.org_id, action="document.deleted", actor_id=principal.user_id,
           actor_role=principal.role, entity="document", entity_id=doc.id,
           detail={"filename": doc.filename})
    db.commit()
    return {"deleted": True, "id": doc.id}


# --------------------------------------------------------------------------- #
# proposals -> confirmation
# --------------------------------------------------------------------------- #
@router.get("/brand-kits/{kit_id}/proposals")
def proposals(kit_id: str, principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    """Everything extracted and waiting for the Admin's confirmation."""
    principal.require("brand_kit:read")
    kit = get_owned(db, BrandKit, kit_id, principal)
    terms = db.execute(select(Term).where(Term.org_id == principal.org_id,
                                          Term.brand_kit_id == kit.id,
                                          Term.status == "proposed")).scalars().all()
    facts = db.execute(select(Fact).where(Fact.org_id == principal.org_id,
                                          Fact.brand_kit_id == kit.id,
                                          Fact.status == "proposed")).scalars().all()
    versions = db.execute(
        select(Rule, RuleVersion, Document.filename)
        .join(RuleVersion, RuleVersion.rule_id == Rule.id)
        .outerjoin(Document, Document.id == RuleVersion.source_document_id)
        .where(Rule.org_id == principal.org_id, Rule.brand_kit_id == kit.id,
               RuleVersion.status == "proposed")
    ).all()
    return {
        "rules": [_rule_out(rule, version, author=None, document=doc) for rule, version, doc in versions],
        "terms": [_term_out(t) for t in terms],
        "facts": [_fact_out(f, db) for f in facts],
    }


@router.post("/brand-kits/{kit_id}/confirm")
def confirm_proposals(kit_id: str, body: ConfirmIn, principal: Principal = Depends(current_user),
                      db: Session = Depends(get_db)):
    """The Admin confirms (or rejects) each extracted rule, term and fact."""
    principal.require("brand_kit:write")
    kit = get_owned(db, BrandKit, kit_id, principal)
    ids = set(body.ids)
    new_status = "active" if body.action == "confirm" else "rejected"
    confirmed: list[str] = []

    for version in db.execute(select(RuleVersion).where(RuleVersion.org_id == principal.org_id,
                                                        RuleVersion.status == "proposed")).scalars():
        rule = db.get(Rule, version.rule_id)
        if (version.id in ids or version.rule_id in ids) and rule and rule.brand_kit_id == kit.id:
            version.status = new_status
            version.author_id = principal.user_id
            rule.active = body.action == "confirm"
            confirmed.append(version.id)

    for term in db.execute(select(Term).where(Term.org_id == principal.org_id,
                                              Term.status == "proposed")).scalars():
        if term.id in ids and term.brand_kit_id == kit.id:
            term.status = "confirmed" if body.action == "confirm" else "deleted"
            confirmed.append(term.id)

    for fact in db.execute(select(Fact).where(Fact.org_id == principal.org_id,
                                              Fact.status == "proposed")).scalars():
        if fact.id in ids and fact.brand_kit_id == kit.id:
            fact.status = "confirmed" if body.action == "confirm" else "deleted"
            fact.confirmed_by = principal.user_id
            confirmed.append(fact.id)

    record(db, org_id=principal.org_id, action=f"brand_kit.{body.action}", actor_id=principal.user_id,
           actor_role=principal.role, entity="brand_kit", entity_id=kit.id,
           detail={"count": len(confirmed), "ids": confirmed[:50]})
    db.commit()
    return {"action": body.action, "confirmed": len(confirmed)}


# --------------------------------------------------------------------------- #
# terms / facts / assets
# --------------------------------------------------------------------------- #
@router.get("/terms", response_model=list[TermOut])
def list_terms(status_filter: str | None = None, principal: Principal = Depends(current_user),
               db: Session = Depends(get_db)):
    principal.require("brand_kit:read")
    q = select(Term).where(Term.org_id == principal.org_id)
    if status_filter:
        q = q.where(Term.status == status_filter)
    rows = db.execute(q.order_by(Term.kind, Term.value)).scalars().all()
    rules = {r.id: r.key for r in db.execute(select(Rule).where(Rule.org_id == principal.org_id)).scalars()}
    return [_term_out(t, rules) for t in rows]


@router.post("/terms", response_model=TermOut, status_code=status.HTTP_201_CREATED)
def create_term(body: dict, principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("brand_kit:write")
    kit = _active_kit(db, principal.org_id)
    term = Term(org_id=principal.org_id, brand_kit_id=kit.id, kind=body.get("kind", "banned"),
                value=body.get("value", "").strip(), replacement=body.get("replacement"),
                severity=body.get("severity", "medium"), note=body.get("note"),
                status=body.get("status", "confirmed"))
    if not term.value:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A term value is required.")
    db.add(term)
    record(db, org_id=principal.org_id, action="term.created", actor_id=principal.user_id,
           actor_role=principal.role, entity="term", entity_id=term.id,
           detail={"kind": term.kind, "value": term.value})
    db.commit()
    return _term_out(term)


@router.delete("/terms/{term_id}")
def delete_term(term_id: str, principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("brand_kit:write")
    term = get_owned(db, Term, term_id, principal)
    term.status = "deleted"
    record(db, org_id=principal.org_id, action="term.deleted", actor_id=principal.user_id,
           actor_role=principal.role, entity="term", entity_id=term.id, detail={"value": term.value})
    db.commit()
    return {"deleted": True}


@router.get("/facts", response_model=list[FactOut])
def list_facts(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("brand_kit:read")
    rows = db.execute(select(Fact).where(Fact.org_id == principal.org_id,
                                         Fact.status != "deleted")).scalars().all()
    return [_fact_out(f, db) for f in rows]


@router.post("/facts", response_model=FactOut, status_code=status.HTTP_201_CREATED)
def create_fact(body: dict, principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("brand_kit:write")
    kit = _active_kit(db, principal.org_id)
    fact = Fact(org_id=principal.org_id, brand_kit_id=kit.id,
                statement=(body.get("statement") or "").strip()[:500], value=body.get("value"),
                topic=body.get("topic"), status="confirmed", confirmed_by=principal.user_id)
    if not fact.statement:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A statement is required.")
    db.add(fact)
    record(db, org_id=principal.org_id, action="fact.created", actor_id=principal.user_id,
           actor_role=principal.role, entity="fact", entity_id=fact.id,
           detail={"statement": fact.statement})
    db.commit()
    return _fact_out(fact, db)


@router.get("/assets", response_model=list[AssetOut])
def list_assets(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("brand_kit:read")
    rows = db.execute(select(Asset).where(Asset.org_id == principal.org_id)).scalars().all()
    return [AssetOut(id=a.id, kind=a.kind, name=a.name, value=a.value, version=a.version,
                     status=a.status, meta=a.meta or {}) for a in rows]


@router.post("/assets/{asset_id}/logo", response_model=AssetOut)
async def upload_logo(asset_id: str, file: UploadFile = File(...),
                      principal: Principal = Depends(current_user),
                      db: Session = Depends(get_db)):
    """Attach the PNG bytes of a logo asset so a review can compare shapes (B5).

    PNG only: a perceptual hash of a JPEG moves with the encoder, and a measurement that
    depends on the compressor is not a measurement. The stored bytes stay in object
    storage; only the hash is compared.
    """
    principal.require("brand_kit:write")
    asset = get_owned(db, Asset, asset_id, principal)
    if asset.kind != "logo":
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Asset '{asset.name}' is a {asset.kind}, not a logo.")
    from .. import storage as _storage
    from ..services import phash as _phash

    data, mime = await _storage.read_upload(file, allow={"image/png"})
    if mime != "image/png" or not data.startswith(b"\x89PNG"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            "Logo comparison needs a PNG file.")
    digest = _phash.phash_bytes(data)
    if not digest:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That PNG could not be read as an image.")
    asset.storage_key = save_bytes(data, org_id=principal.org_id, prefix="logos",
                                   filename=file.filename or "logo.png")
    asset.phash = digest
    asset.meta = {**(asset.meta or {}), "logo_png": True}
    record(db, org_id=principal.org_id, action="asset.logo_uploaded", actor_id=principal.user_id,
           actor_role=principal.role, entity="asset", entity_id=asset.id,
           detail={"name": asset.name, "phash": digest})
    db.commit()
    return AssetOut(id=asset.id, kind=asset.kind, name=asset.name, value=asset.value,
                    version=asset.version, status=asset.status, meta=asset.meta or {})


@router.post("/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(body: dict, principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("brand_kit:write")
    kit = _active_kit(db, principal.org_id)
    asset = Asset(org_id=principal.org_id, brand_kit_id=kit.id, kind=body.get("kind", "colour"),
                  name=body.get("name", "Asset"), value=body.get("value", ""),
                  version=body.get("version"), status=body.get("status", "confirmed"),
                  meta=body.get("meta") or {})
    db.add(asset)
    record(db, org_id=principal.org_id, action="asset.created", actor_id=principal.user_id,
           actor_role=principal.role, entity="asset", entity_id=asset.id,
           detail={"kind": asset.kind, "value": asset.value})
    db.commit()
    return AssetOut(id=asset.id, kind=asset.kind, name=asset.name, value=asset.value,
                    version=asset.version, status=asset.status, meta=asset.meta or {})


# --------------------------------------------------------------------------- #
# rules + versions
# --------------------------------------------------------------------------- #
@router.get("/rules", response_model=list[RuleOut])
def list_rules(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("rules:read")
    rows = db.execute(
        select(Rule, RuleVersion, User.name)
        .join(RuleVersion, RuleVersion.rule_id == Rule.id)
        .outerjoin(User, User.id == RuleVersion.author_id)
        .where(Rule.org_id == principal.org_id, RuleVersion.version == Rule.current_version,
               Rule.active.is_(True), RuleVersion.status == "active")
        .order_by(Rule.category, Rule.key)
    ).all()
    docs = {d.id: d.filename for d in db.execute(select(Document).where(
        Document.org_id == principal.org_id)).scalars()}
    # A rule whose source section moved in a newer guideline is still active; it is
    # only *marked*, so the badge on the rules page has something true to show.
    pending = {t.rule_id for t in db.execute(
        select(RuleReviewTask).where(RuleReviewTask.org_id == principal.org_id,
                                     RuleReviewTask.status == "needs_review")).scalars()}
    out = []
    for rule, version, author in rows:
        item = _rule_out(rule, version, author, docs.get(version.source_document_id))
        item.needs_review = rule.id in pending
        out.append(item)
    return out


@router.get("/rules/{rule_id}/versions", response_model=list[RuleVersionOut])
def rule_versions(rule_id: str, principal: Principal = Depends(current_user),
                  db: Session = Depends(get_db)):
    principal.require("rules:read")
    rule = get_owned(db, Rule, rule_id, principal)
    rows = db.execute(
        select(RuleVersion, User.name).outerjoin(User, User.id == RuleVersion.author_id)
        .where(RuleVersion.rule_id == rule.id).order_by(RuleVersion.version.desc())
    ).all()
    out = []
    for version, author in rows:
        item = _rule_out(rule, version, author, None)
        out.append(RuleVersionOut(**item.model_dump(), rule_id=rule.id,
                                  is_current=version.version == rule.current_version))
    return out


@router.patch("/rules/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: str, body: RuleUpdateIn, principal: Principal = Depends(current_user),
                db: Session = Depends(get_db)):
    """Editing a rule creates a new version — history is never overwritten."""
    principal.require("brand_kit:write")
    rule = get_owned(db, Rule, rule_id, principal)
    if rule.requires_approver and principal.role not in ("admin", "brand_manager", "approver"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This rule needs an Approver.")
    current = db.execute(select(RuleVersion).where(RuleVersion.rule_id == rule.id,
                                                   RuleVersion.version == rule.current_version)).scalars().first()
    if current is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Rule has no current version.")
    for old in db.execute(select(RuleVersion).where(RuleVersion.rule_id == rule.id,
                                                    RuleVersion.status == "active")).scalars():
        old.status = "superseded"
    new_version = RuleVersion(
        org_id=rule.org_id, rule_id=rule.id, version=rule.current_version + 1,
        title=body.title or current.title, body=body.body or current.body,
        scope_department=body.scope_department if body.scope_department is not None else current.scope_department,
        scope_content_type=body.scope_content_type if body.scope_content_type is not None else current.scope_content_type,
        author_id=principal.user_id, reason=body.reason or "Rule edited",
        status="active", source_document_id=current.source_document_id,
        source_page=current.source_page, source_section=current.source_section,
        embedding=get_adapter().embed([body.body or current.body])[0],
    )
    db.add(new_version)
    if body.category:
        rule.category = body.category
    rule.current_version += 1
    db.flush()
    record(db, org_id=principal.org_id, action="rule.edited", actor_id=principal.user_id,
           actor_role=principal.role, entity="rule_version", entity_id=new_version.id,
           detail={"rule_key": rule.key, "version": new_version.version, "reason": body.reason})
    db.commit()
    return _rule_out(rule, new_version, principal.name, None)


@router.post("/rules/{rule_id}/revert/{version_number}", response_model=RuleVersionOut)
def revert_rule(rule_id: str, version_number: int, body: dict | None = None,
                principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("brand_kit:write")
    rule = get_owned(db, Rule, rule_id, principal)
    target = db.execute(select(RuleVersion).where(RuleVersion.rule_id == rule.id,
                                                  RuleVersion.version == version_number)).scalars().first()
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That rule version does not exist.")
    restored = revert_rule_version(db, rule, target, principal, (body or {}).get("reason"))
    db.commit()
    return RuleVersionOut(**_rule_out(rule, restored, principal.name, None).model_dump(),
                          rule_id=rule.id, is_current=True)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _rule_out(rule: Rule, version: RuleVersion, author: str | None,
              document: str | None) -> RuleOut:
    return RuleOut(
        id=rule.id, key=rule.key, category=rule.category, check_type=rule.check_type,
        requires_approver=rule.requires_approver, current_version=rule.current_version,
        active=rule.active, version_id=version.id, version=version.version,
        title=version.title, body=version.body, scope_department=version.scope_department,
        scope_content_type=version.scope_content_type, status=version.status,
        author_name=author, reason=version.reason, source_document=document,
        source_page=version.source_page, source_section=version.source_section,
        created_at=version.created_at,
    )


def _term_out(term: Term, rule_keys: dict[str, str] | None = None) -> TermOut:
    return TermOut(id=term.id, kind=term.kind, value=term.value, replacement=term.replacement,
                   severity=term.severity, note=term.note, status=term.status,
                   rule_key=(rule_keys or {}).get(term.rule_id) if term.rule_id else None)


def _fact_out(fact: Fact, db: Session) -> FactOut:
    doc = db.get(Document, fact.source_document_id) if fact.source_document_id else None
    return FactOut(id=fact.id, statement=fact.statement, value=fact.value, topic=fact.topic,
                   status=fact.status, source_document=doc.filename if doc else None,
                   source_page=fact.source_page)


# --------------------------------------------------------------------------- #
@router.post("/brand-kits/{kit_id}/refresh-proposals")
def refresh_proposals(kit_id: str, principal: Principal = Depends(current_user),
                      db: Session = Depends(get_db)):
    """Re-derive candidate rules from the organisation's own documents.

    Useful when a kit was seeded or imported without proposals, or after a new
    guideline is uploaded. Existing proposals are replaced; confirmed rules are
    never touched, and nothing here affects a review until an Admin confirms it.
    """
    principal.require("brand_kit:write")
    kit = get_owned(db, BrandKit, kit_id, principal)
    docs = db.execute(select(Document).where(Document.org_id == principal.org_id,
                                             Document.brand_kit_id == kit.id,
                                             Document.status != "deleted")).scalars().all()
    # replace any earlier *unconfirmed* proposals instead of piling duplicates on top
    for version in db.execute(select(RuleVersion).where(RuleVersion.org_id == principal.org_id,
                                                        RuleVersion.status == "proposed")).scalars().all():
        rule = db.get(Rule, version.rule_id)
        if rule and rule.brand_kit_id == kit.id:
            db.delete(version)
            db.flush()
            db.delete(rule)
    for term in db.execute(select(Term).where(Term.org_id == principal.org_id,
                                             Term.brand_kit_id == kit.id,
                                             Term.status == "proposed")).scalars().all():
        db.delete(term)
    for fact in db.execute(select(Fact).where(Fact.org_id == principal.org_id,
                                             Fact.brand_kit_id == kit.id,
                                             Fact.status == "proposed")).scalars().all():
        db.delete(fact)
    db.flush()

    adapter = get_adapter()
    created = 0
    for doc in docs:
        if doc.kind not in ("guideline", "term_list", "approved_facts", "legal"):
            continue
        # prefer the original document text (keeps headings and line structure);
        # fall back to the hydrated chunks for binary formats
        text = ""
        try:
            text = read_bytes(doc.storage_key).decode("utf-8", errors="replace")
        except Exception:
            text = ""
        if not text.strip():
            chunks = db.execute(select(Chunk).where(Chunk.document_id == doc.id)
                                .order_by(Chunk.ordinal)).scalars().all()
            text = "\n".join(c.text for c in chunks)
        if not text.strip():
            continue
        proposals = adapter.propose_rules(text, {"kind": doc.kind})
        _store_proposals(db, principal, kit, doc, proposals, doc.kind)
        created += len(proposals.get("rules", [])) + len(proposals.get("terms", [])) + len(proposals.get("facts", []))
    record(db, org_id=principal.org_id, action="brand_kit.proposals_refreshed",
           actor_id=principal.user_id, actor_role=principal.role, entity="brand_kit",
           entity_id=kit.id, detail={"proposals": created})
    db.commit()
    return {"created": created}


@router.post("/brand-kits/{kit_id}/sample")
def load_sample_kit(kit_id: str, principal: Principal = Depends(current_user),
                    db: Session = Depends(get_db)):
    """Fill an EMPTY kit with the bundled sample data, so a new workspace can review today.

    This writes no new content: every rule, term, fact and asset below is imported from
    `seed/brand_kit.py`, the same fictional set the demo workspace uses. It is labelled
    "sample" everywhere it lands — the kit name, the document metadata, and each rule's
    reason — so nobody mistakes Northwind's standards for their own.

    It refuses a kit that already holds rules, terms or facts. Overwriting a real Brand
    Kit with demo data would be precisely the kind of silent change this product exists
    to prevent.
    """
    principal.require("brand_kit:write")
    kit = get_owned(db, BrandKit, kit_id, principal)

    existing_rules = db.execute(select(Rule).where(Rule.brand_kit_id == kit.id)).scalars().all()
    existing_terms = db.execute(select(Term).where(Term.brand_kit_id == kit.id)).scalars().all()
    existing_facts = db.execute(select(Fact).where(Fact.brand_kit_id == kit.id)).scalars().all()
    if existing_rules or existing_terms or existing_facts:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This kit already has content, so the sample was not loaded. Load the sample into "
            "a new kit instead, or add rules by hand.")

    from seed.brand_kit import ASSETS, FACTS, GUIDELINE_TEXT, RULES, TERMS

    adapter = get_adapter()
    label = "sample — fictional demo data from the bundled sample kit"

    # ---- the guideline document the rules cite -----------------------------
    body_bytes = GUIDELINE_TEXT.encode()
    key = save_bytes(body_bytes, org_id=principal.org_id, prefix="documents",
                     filename="sample-brand-guidelines.md")
    doc = Document(org_id=principal.org_id, brand_kit_id=kit.id, filename="sample-brand-guidelines.md",
                   mime="text/markdown", size_bytes=len(body_bytes), kind="guideline", version=1,
                   pages=6, status="extracted", storage_key=key,
                   meta={"source": "sample", "note": label})
    db.add(doc)
    db.flush()

    blocks: list[dict] = []
    page = 1
    for line in GUIDELINE_TEXT.splitlines():
        text = line.strip()
        if not text:
            continue
        if text[:1].isdigit() and text.split(".")[0].isdigit():
            page = min(6, max(1, int(text.split(".")[0])))
        blocks.append({"id": "", "kind": "heading" if text[:1].isdigit() else "paragraph",
                       "text": text, "page": page, "meta": {}})
    body, blocks = blocks_to_text(blocks)
    page_map = [{"start": b["start"], "end": b["end"], "page": b["page"]} for b in blocks]
    ingest_document(db, org_id=principal.org_id, document=doc, text=body, page_map=page_map)

    # ---- rules, terms, facts, assets (exactly the seed's set) --------------
    rule_by_key: dict[str, Rule] = {}
    for spec in RULES:
        rule = Rule(org_id=principal.org_id, brand_kit_id=kit.id, key=spec["key"],
                    category=spec["category"], check_type=spec["check_type"],
                    requires_approver=spec["requires_approver"], current_version=1, active=True)
        db.add(rule)
        db.flush()
        db.add(RuleVersion(
            org_id=principal.org_id, rule_id=rule.id, version=1, title=spec["title"],
            body=spec["body"], author_id=principal.user_id, status="active",
            source_document_id=doc.id, source_page=spec["source_page"],
            source_section=spec["source_section"],
            reason=(f"Sample rule, loaded on request. {label.capitalize()}."),
            embedding=adapter.embed([spec["body"]])[0],
        ))
        rule_by_key[spec["key"]] = rule

    for kind, value, replacement, severity, note in TERMS:
        db.add(Term(org_id=principal.org_id, brand_kit_id=kit.id, kind=kind, value=value,
                    replacement=replacement, severity=severity,
                    note=f"Sample term. {note}" if note else "Sample term.",
                    status="confirmed", rule_id=rule_by_key["TERM-001"].id))

    for statement, value, topic, page_no in FACTS:
        db.add(Fact(org_id=principal.org_id, brand_kit_id=kit.id, statement=statement,
                    value=value, topic=topic, source_document_id=doc.id, source_page=page_no,
                    status="confirmed", confirmed_by=principal.user_id,
                    confirmed_at=datetime.now(timezone.utc)))

    for asset in ASSETS:
        db.add(Asset(org_id=principal.org_id, brand_kit_id=kit.id, kind=asset["kind"],
                     name=f"{asset['name']} (sample)", value=asset["value"],
                     version=asset.get("version"), status=asset["status"],
                     meta={**(asset.get("meta") or {}), "sample": True}))

    if "(sample)" not in kit.name:
        kit.name = f"{kit.name} (sample)"[:200]

    record(db, org_id=principal.org_id, action="brand_kit.sample_loaded", actor_id=principal.user_id,
           actor_role=principal.role, entity="brand_kit", entity_id=kit.id,
           detail={"rules": len(RULES), "terms": len(TERMS), "facts": len(FACTS),
                   "assets": len(ASSETS), "source": "seed/brand_kit.py"})
    db.commit()
    return {
        "kit_id": kit.id, "name": kit.name, "status": kit.status,
        "loaded": {"rules": len(RULES), "terms": len(TERMS), "facts": len(FACTS),
                   "assets": len(ASSETS), "documents": 1},
        "sample": True,
        "note": "Fictional sample data. Nothing here is your organisation's standard — "
                "replace or delete it whenever you like.",
    }


@router.get("/brand-kits/{kit_id}/health")
def kit_health(kit_id: str, principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    """Quick completeness check the Admin sees before activating a kit."""
    principal.require("brand_kit:read")
    kit = get_owned(db, BrandKit, kit_id, principal)
    docs = db.execute(select(Document).where(Document.brand_kit_id == kit.id,
                                             Document.status != "deleted")).scalars().all()
    rules = db.execute(select(Rule).where(Rule.brand_kit_id == kit.id, Rule.active.is_(True))).scalars().all()
    terms = db.execute(select(Term).where(Term.brand_kit_id == kit.id, Term.status == "confirmed")).scalars().all()
    facts = db.execute(select(Fact).where(Fact.brand_kit_id == kit.id, Fact.status == "confirmed")).scalars().all()
    assets = db.execute(select(Asset).where(Asset.brand_kit_id == kit.id)).scalars().all()
    categories = {r.category for r in rules}
    checks = [
        {"item": "Guideline document ingested", "ok": any(d.kind == "guideline" for d in docs)},
        {"item": "Brand colours confirmed", "ok": any(a.kind == "colour" for a in assets)},
        {"item": "Fonts confirmed", "ok": any(a.kind == "font" for a in assets)},
        {"item": "Logo version recorded", "ok": any(a.kind == "logo" for a in assets)},
        {"item": "Term list confirmed", "ok": len(terms) > 0},
        {"item": "Approved facts confirmed", "ok": len(facts) > 0},
        {"item": "All six reviewer categories have at least one rule",
         "ok": {"brand_voice", "terminology", "visual", "accessibility", "legal", "fact"} <= categories},
    ]
    return {"kit_id": kit.id, "checks": checks,
            "ready": all(c["ok"] for c in checks),
            "counts": {"documents": len(docs), "rules": len(rules), "terms": len(terms),
                       "facts": len(facts), "assets": len(assets)}}


@router.get("/provider")
def ai_provider(principal: Principal = Depends(current_user)):
    """Transparency: which AI provider and model the backend is calling."""
    return provider_info()
