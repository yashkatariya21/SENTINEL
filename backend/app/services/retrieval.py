"""Brand Kit chunking, embedding and retrieval (pgvector in production).

Chunking: 300-500 tokens with 60-token overlap, sentence-aligned, page and
heading aware. Embeddings are written to `chunks.embedding` (JSON, portable) and,
on PostgreSQL, mirrored into a `chunk_vectors` table with an IVFFlat index so
nearest-neighbour search happens in the database.
"""
from __future__ import annotations

import re

from sqlalchemy import select, text as sql
from sqlalchemy.orm import Session

from ..config import settings
from ..llm.base import cosine
from ..llm.factory import get_adapter
from ..models import Asset, Chunk, Document, Fact, Rule, RuleVersion, Term


def _tokens(s: str) -> int:
    return len(re.findall(r"\S+", s))


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n{2,}", text)
    return [p.strip() for p in parts if p and p.strip()]


def chunk_text(text: str, *, page_map: list[dict] | None = None,
               min_tokens: int | None = None, max_tokens: int | None = None,
               overlap: int | None = None) -> list[dict]:
    """Split into 300-500 token chunks with ~60 token overlap, page + heading aware."""
    min_tokens = min_tokens or settings.chunk_min_tokens
    max_tokens = max_tokens or settings.chunk_max_tokens
    overlap = overlap if overlap is not None else settings.chunk_overlap_tokens

    sents = _sentences(text)
    if not sents:
        return []

    def page_at(offset: int) -> int:
        for pm in (page_map or []):
            if pm["start"] <= offset < pm["end"]:
                return int(pm.get("page", 1))
        return 1

    # sentence -> absolute offset (first occurrence scan, monotonic)
    offsets: list[int] = []
    cursor = 0
    for sent in sents:
        idx = text.find(sent, cursor)
        if idx < 0:
            idx = cursor
        offsets.append(idx)
        cursor = idx + len(sent)

    def heading_before(idx: int) -> str | None:
        """Last numbered section heading before this offset (e.g. '7. Accessibility')."""
        head = None
        for m in re.finditer(r"(?m)^\s*\d+[.)]\s+([A-Z][^\n]{2,70})$", text[:idx]):
            head = m.group(1).strip()
        return head

    windows: list[tuple[int, int]] = []
    i = 0
    n = len(sents)
    while i < n:
        start, tokens = i, 0
        while i < n and tokens + _tokens(sents[i]) <= max_tokens:
            tokens += _tokens(sents[i])
            i += 1
        if i == start:  # a single sentence longer than max_tokens
            i += 1
        windows.append((start, i))
        if i >= n:
            break
        back, kept = i, 0
        while back > start and kept < overlap:
            back -= 1
            kept += _tokens(sents[back])
        i = max(back, start + 1)

    # a very short tail is merged into the previous window, but never past max_tokens
    if len(windows) > 1:
        s0, e0 = windows[-1]
        tail = sum(_tokens(x) for x in sents[s0:e0])
        ps, pe = windows[-2]
        head = sum(_tokens(x) for x in sents[ps:pe])
        if tail < min_tokens and head + tail <= max_tokens:
            windows[-2] = (ps, e0)
            windows.pop()

    chunks: list[dict] = []
    seen: set[str] = set()
    for ordinal, (a, b) in enumerate(windows):
        body = " ".join(sents[a:b]).strip()
        if not body or body in seen:
            continue
        seen.add(body)
        chunks.append({
            "text": body, "page": page_at(offsets[a]), "heading": heading_before(offsets[a]),
            "ordinal": ordinal, "token_count": _tokens(body),
        })
    return chunks


# --------------------------------------------------------------------------- #
def ingest_document(db: Session, *, org_id: str, document: Document, text: str,
                    page_map: list[dict] | None = None) -> list[Chunk]:
    adapter = get_adapter()
    pieces = chunk_text(text, page_map=page_map)
    if not pieces:
        return []
    vectors = adapter.embed([p["text"] for p in pieces])
    rows: list[Chunk] = []
    for piece, vec in zip(pieces, vectors):
        row = Chunk(
            org_id=org_id, document_id=document.id, brand_kit_id=document.brand_kit_id,
            document_version=document.version, page=piece["page"], ordinal=piece["ordinal"],
            heading=piece["heading"], text=piece["text"], token_count=piece["token_count"],
            embedding=vec,
        )
        db.add(row)
        rows.append(row)
    db.flush()
    if settings.is_postgres:
        _mirror_vectors(db, rows)
    return rows


def _vector_dim() -> int:
    """Dimension of the vectors the active provider produces (256 offline, 1536 hosted)."""
    return int(getattr(get_adapter(), "embedding_dim", 1536) or 1536)


def ensure_vector_table(db: Session, dim: int | None = None) -> None:
    """Create/repair the pgvector mirror at the provider's dimension.

    The column used to be declared `vector(1536)` unconditionally, but the offline engine
    (the default, zero-cost path) emits 256-dimension vectors — so on PostgreSQL every
    insert failed with "expected 1536 dimensions, not 256" and retrieval returned nothing.
    When the dimension does not match, the mirror is rebuilt from `chunks.embedding` (the
    durable copy), so nothing needs re-analysing.
    """
    if not settings.is_postgres:
        return
    dim = dim or _vector_dim()
    existing = db.execute(sql(
        "SELECT atttypmod FROM pg_attribute "
        "WHERE attrelid = to_regclass('chunk_vectors') AND attname = 'embedding'"
    )).scalar()
    if existing == dim:
        return
    if existing is not None:
        db.execute(sql("DROP TABLE chunk_vectors"))
    db.execute(sql(
        f"CREATE TABLE IF NOT EXISTS chunk_vectors "
        f"(chunk_id text PRIMARY KEY, org_id text NOT NULL, embedding vector({dim}))"
    ))
    db.execute(sql("CREATE INDEX IF NOT EXISTS ix_chunk_vectors_org ON chunk_vectors (org_id)"))
    db.execute(sql(
        "CREATE INDEX IF NOT EXISTS ix_chunk_vectors_ivfflat "
        "ON chunk_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    ))
    # re-populate from the durable JSON copy of every embedding already in the database
    for chunk in db.execute(select(Chunk).where(Chunk.embedding.isnot(None))).scalars():
        if not chunk.embedding or len(chunk.embedding) != dim:
            continue
        vec = "[" + ",".join(str(round(v, 6)) for v in chunk.embedding) + "]"
        db.execute(
            sql("INSERT INTO chunk_vectors (chunk_id, org_id, embedding) VALUES (CAST(:c AS text), CAST(:o AS text), CAST(:v AS vector)) "
                "ON CONFLICT (chunk_id) DO UPDATE SET embedding = CAST(:v AS vector)"),
            {"c": chunk.id, "o": chunk.org_id, "v": vec},
        )


def _mirror_vectors(db: Session, rows: list[Chunk]) -> None:
    dim = _vector_dim()
    ensure_vector_table(db, dim)
    for row in rows:
        vec = "[" + ",".join(str(round(v, 6)) for v in row.embedding) + "]"
        db.execute(
            sql("INSERT INTO chunk_vectors (chunk_id, org_id, embedding) VALUES (CAST(:c AS text), CAST(:o AS text), CAST(:v AS vector)) "
                "ON CONFLICT (chunk_id) DO UPDATE SET embedding = CAST(:v AS vector)"),
            {"c": row.id, "o": row.org_id, "v": vec},
        )


def retrieve(db: Session, *, org_id: str, brand_kit_id: str, query: str,
             limit: int = 6, min_score: float = 0.05) -> list[dict]:
    """Nearest brand-kit chunks for a query, always filtered by organisation."""
    adapter = get_adapter()
    qvec = adapter.embed([query])[0]

    if settings.is_postgres:
        rows = db.execute(sql(
            """
            SELECT c.id, c.text, c.page, c.heading, c.brand_kit_id, d.filename,
                   1 - (v.embedding <=> CAST(:q AS vector)) AS score
            FROM chunk_vectors v
            JOIN chunks c ON c.id = v.chunk_id
            JOIN documents d ON d.id = c.document_id
            WHERE v.org_id = :org AND c.brand_kit_id = :kit AND c.org_id = :org
            ORDER BY v.embedding <=> CAST(:q AS vector)
            LIMIT :lim
            """
        ), {"q": "[" + ",".join(str(round(x, 6)) for x in qvec) + "]", "org": org_id,
            "kit": brand_kit_id, "lim": limit}).mappings().all()
        return [{
            "chunk_id": r["id"], "text": r["text"], "page": r["page"], "section": r["heading"],
            "document": r["filename"], "score": round(float(r["score"]), 4),
        } for r in rows if float(r["score"]) >= min_score]

    rows = db.execute(
        select(Chunk, Document.filename)
        .join(Document, Document.id == Chunk.document_id)
        .where(Chunk.org_id == org_id, Chunk.brand_kit_id == brand_kit_id)
    ).all()
    scored = []
    for chunk, filename in rows:
        score = cosine(qvec, chunk.embedding or [])
        if score >= min_score:
            scored.append((score, chunk, filename))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{
        "chunk_id": c.id, "text": c.text, "page": c.page, "section": c.heading,
        "document": filename, "score": round(float(s), 4),
    } for s, c, filename in scored[:limit]]


# --------------------------------------------------------------------------- #
def rules_in_scope(db: Session, *, org_id: str, brand_kit_id: str,
                   content_type: str | None = None,
                   department: str | None = None) -> list[dict]:
    """Active rule versions whose scope matches this content. Org filtered."""
    rows = db.execute(
        select(Rule, RuleVersion)
        .join(RuleVersion, RuleVersion.rule_id == Rule.id)
        .where(
            Rule.org_id == org_id, Rule.brand_kit_id == brand_kit_id,
            Rule.active.is_(True), RuleVersion.status == "active",
            RuleVersion.version == Rule.current_version,
        )
    ).all()
    out = []
    for rule, version in rows:
        if version.scope_content_type and content_type and version.scope_content_type != content_type:
            continue
        if version.scope_department and department and version.scope_department != department:
            continue
        out.append({
            "rule_id": rule.id, "key": rule.key, "category": rule.category,
            "check_type": rule.check_type, "requires_approver": rule.requires_approver,
            "version_id": version.id, "version": version.version,
            "title": version.title, "body": version.body,
            "scope_department": version.scope_department,
            "scope_content_type": version.scope_content_type,
            "source_document_id": version.source_document_id, "source_page": version.source_page,
            "source_section": version.source_section,
        })
    return out


def kit_bundle(db: Session, *, org_id: str, brand_kit_id: str) -> dict:
    """Everything the deterministic checks need, in one org-scoped read."""
    terms = db.execute(
        select(Term).where(Term.org_id == org_id, Term.brand_kit_id == brand_kit_id,
                           Term.status == "confirmed")
    ).scalars().all()
    assets = db.execute(
        select(Asset).where(Asset.org_id == org_id, Asset.brand_kit_id == brand_kit_id,
                            Asset.status.in_(("confirmed", "proposed")))
    ).scalars().all()
    facts = db.execute(
        select(Fact).where(Fact.org_id == org_id, Fact.brand_kit_id == brand_kit_id,
                           Fact.status == "confirmed")
    ).scalars().all()
    rules = db.execute(
        select(Rule).where(Rule.org_id == org_id, Rule.brand_kit_id == brand_kit_id, Rule.active.is_(True))
    ).scalars().all()
    rule_by_id = {r.id: r for r in rules}

    colours = [a.value for a in assets if a.kind == "colour" and a.value]
    fonts = [a.value or a.name for a in assets if a.kind == "font"]
    logos = [{"name": a.name, "version": a.version, "value": a.value}
             for a in assets if a.kind == "logo"]
    contrast_pairs = []
    naming_variants = []
    aspect_ratios = {}
    for a in assets:
        meta = a.meta or {}
        if a.kind == "colour" and meta.get("contrast_pairs"):
            for pair in meta["contrast_pairs"]:
                if isinstance(pair, (list, tuple)) and len(pair) == 2:
                    contrast_pairs.append((pair[0], pair[1]))
        if a.kind == "logo" and meta.get("aspect_ratios"):
            aspect_ratios.update(meta["aspect_ratios"])
        if a.kind == "font" and meta.get("aspect_ratios"):
            aspect_ratios.update(meta["aspect_ratios"])
        if meta.get("naming_variants"):
            naming_variants.extend(meta["naming_variants"])

    return {
        "terms": [{
            "kind": t.kind, "value": t.value, "replacement": t.replacement,
            "severity": t.severity, "status": t.status,
            "rule_key": rule_by_id[t.rule_id].key if t.rule_id and t.rule_id in rule_by_id else None,
        } for t in terms],
        "palette": colours,
        "contrast_pairs": contrast_pairs,
        "fonts": fonts,
        "logos": logos,
        "logo_version": (logos[0]["version"] if logos else None),
        "aspect_ratios": aspect_ratios,
        "naming_variants": naming_variants,
        "facts": [{
            "id": f.id, "statement": f.statement, "value": f.value, "topic": f.topic,
            "source_document_id": f.source_document_id, "source_page": f.source_page,
        } for f in facts],
    }
