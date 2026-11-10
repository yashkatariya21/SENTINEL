"""Review pipeline: deterministic checks -> retrieval -> six parallel reviewers
-> merge by span overlap -> label + confidence -> persist.

Order matters. Deterministic findings are produced first so they anchor the
confidence score and are never "argued away" by a model.
"""
from __future__ import annotations

import hashlib
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import session_scope
from ..llm.base import ReviewContext
from ..llm.factory import get_adapter
from ..models import (
    AnalysisRun, BrandKit, ContentItem, ContentVersion, Fact, Finding, RuleVersion,
)
from ..schemas import ReviewerName
from . import deterministic
from .exceptions import exception_value
from .extraction import injection_scan
from .retrieval import kit_bundle, retrieve, rules_in_scope

log = logging.getLogger("sentinel.pipeline")

REVIEWERS: tuple[ReviewerName, ...] = (
    "brand_voice", "terminology", "fact_checker", "visual", "accessibility", "legal",
)
SEV_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}
SEV_WEIGHT = {"low": 1, "medium": 2, "high": 4, "critical": 8}


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _clock() -> str:
    return datetime.now(timezone.utc).isoformat()


def active_brand_kit(db: Session, org_id: str) -> BrandKit:
    kit = db.execute(
        select(BrandKit).where(BrandKit.org_id == org_id, BrandKit.status == "active")
        .order_by(BrandKit.version.desc())
    ).scalars().first()
    if kit is None:
        kit = db.execute(select(BrandKit).where(BrandKit.org_id == org_id)
                         .order_by(BrandKit.version.desc())).scalars().first()
    if kit is None:
        raise RuntimeError("No Brand Kit exists for this organisation. Upload one first.")
    return kit


def _span_overlap(a: dict, b: dict) -> float:
    a0, a1, b0, b1 = a["span_start"], a["span_end"], b["span_start"], b["span_end"]
    if a0 == a1 == b0 == b1:
        return 1.0
    inter = max(0, min(a1, b1) - max(a0, b0))
    union = max(a1, b1) - min(a0, b0)
    if union <= 0:
        return 0.0
    return inter / union


def _suggestion_is_span_local(text: str, start: int, end: int, suggestion: str | None) -> bool:
    """A suggestion may only rewrite the flagged span."""
    if not suggestion:
        return False
    span = text[start:end]
    if not span.strip():
        return False
    if len(suggestion) > max(240, len(span) * 4):
        return False
    if "\n\n" in suggestion and "\n\n" not in span:
        return False
    return True


def compute_confidence(*, agreement: float, evidence_strength: float, deterministic_backing: float) -> float:
    """Documented, reproducible confidence formula.

    confidence = 0.45 * agreement_across_repeat_runs
               + 0.35 * evidence_strength (retrieval + rule match)
               + 0.20 * deterministic_backing
    """
    value = 0.45 * agreement + 0.35 * evidence_strength + 0.20 * deterministic_backing
    return round(max(0.0, min(1.0, value)), 3)


def band(confidence: float) -> str:
    return "low" if confidence < 0.5 else ("medium" if confidence < 0.75 else "high")


# --------------------------------------------------------------------------- #
def _deterministic_metrics() -> dict:
    """Deterministic checks make no model call, so tokens and cost are zero by fact."""
    return {"latency_ms": 0.0, "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0,
            "provider": "local", "model": "deterministic", "deterministic": True}


def deterministic_candidates(prep: dict, rules: list[dict]) -> list[dict]:
    """Turn deterministic check output into reviewer-shaped candidates."""
    rule_by_key = {r["key"]: r for r in rules}
    reviewer_for = {"terminology": "terminology", "visual": "visual",
                    "accessibility": "accessibility", "legal": "legal",
                    "brand_voice": "brand_voice", "fact": "fact_checker"}
    out = []
    for d in prep["deterministic"]:
        rule = rule_by_key.get(d["rule_key"])
        out.append({
            "reviewer": reviewer_for.get(d["category"], "brand_voice"),
            "category": d["category"], "severity": d["severity"],
            "span_start": d["span_start"], "span_end": d["span_end"],
            "span_text": d["span_text"], "issue": d["issue"], "why": d["why"],
            "impact": d["impact"], "suggestion": d["suggestion"],
            "deterministic": True, "direct_contradiction": True,
            # never claim a rule we cannot quote: a rule scoped to another content type or
            # department is simply not in scope here, and the finding's `why` (brand-kit
            # term list / approved fact) then carries the explanation on its own
            "evidence_strength": 1.0, "rule_key": rule["key"] if rule else None,
            "evidence": None, "run_index": 0, "metrics": _deterministic_metrics(),
        })
    return out


def reviewer_candidates(adapter, ctx: ReviewContext, repeat_runs: int) -> list[dict]:
    """Six reviewers in parallel, repeated `repeat_runs` times for agreement scoring."""

    def call(reviewer: ReviewerName, run_index: int) -> list[dict]:
        # Measure what actually happened: wall-clock per reviewer call, and the token
        # counters the hosted adapter keeps. The deterministic engine reports zero
        # tokens because it makes no model call — that is a fact, not a zero-fill.
        before_tokens = (getattr(adapter, "prompt_tokens", 0), getattr(adapter, "completion_tokens", 0))
        started = time.perf_counter()
        try:
            out = adapter.review(reviewer, ctx, temperature=run_index)
        except Exception as exc:  # one reviewer must never kill a run
            log.warning("reviewer %s failed on run %s: %s", reviewer, run_index, type(exc).__name__)
            return []
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        after_tokens = (getattr(adapter, "prompt_tokens", 0), getattr(adapter, "completion_tokens", 0))
        prompt_tokens = max(0, after_tokens[0] - before_tokens[0])
        completion_tokens = max(0, after_tokens[1] - before_tokens[1])
        rows = []
        for f in out.findings:
            evidence = None
            if f.evidence_ref is not None:
                ref = f.evidence_ref
                match = next((e for e in ctx.evidence if e.get("chunk_id") == ref.chunk_id), None)
                if match is None and ref.document:
                    match = next((e for e in ctx.evidence if e.get("document") == ref.document), None)
                if match is not None:  # unverified citations are dropped, never rendered
                    evidence = {
                        "document": match.get("document"), "page": match.get("page"),
                        "section": match.get("section"), "chunk_id": match.get("chunk_id"),
                        "snippet": best_snippet(match.get("text") or "", f.span_text),
                        "score": match.get("score"),
                    }
            rows.append({
                "reviewer": f.reviewer, "category": f.category or f.reviewer,
                "severity": f.severity, "span_start": f.span_start, "span_end": f.span_end,
                "span_text": f.span_text, "issue": f.issue, "why": f.why,
                "impact": f.impact, "suggestion": f.suggestion,
                "deterministic": bool(f.deterministic),
                "direct_contradiction": bool(f.direct_contradiction),
                "evidence_strength": float(f.evidence_strength),
                "rule_key": f.rule_key, "evidence": evidence, "run_index": run_index,
                "metrics": {
                    "latency_ms": latency_ms,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "cost_usd": _cost_usd(getattr(adapter, "model_name", ""), prompt_tokens, completion_tokens),
                    "provider": getattr(adapter, "provider_name", "local"),
                    "model": getattr(adapter, "model_name", "sentinel-local-1"),
                },
            })
        return rows

    jobs = [(reviewer, i) for i in range(repeat_runs) for reviewer in REVIEWERS]
    rows: list[dict] = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for batch in pool.map(lambda job: call(*job), jobs):
            rows.extend(batch)
    return rows


# Published list prices (USD per 1M tokens) used only to *estimate* cost from the real
# token counts a provider reports. Unknown models get None, never a guess.
_PRICES = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "claude-3-5-haiku-latest": (0.80, 4.00),
    "claude-sonnet-4": (3.00, 15.00),
}


def _cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float | None:
    price = _PRICES.get(model)
    if price is None:
        return None
    return round(prompt_tokens / 1_000_000 * price[0] + completion_tokens / 1_000_000 * price[1], 8)


def run_metrics(merged: list[dict], *, wall_ms: float, provider: str, model: str) -> dict:
    """Aggregate the per-finding measurements of one run."""
    latencies = [f["metrics"]["latency_ms"] for f in merged if f.get("metrics")]
    prompt_tokens = sum(f["metrics"]["prompt_tokens"] for f in merged if f.get("metrics"))
    completion_tokens = sum(f["metrics"]["completion_tokens"] for f in merged if f.get("metrics"))
    costs = [f["metrics"]["cost_usd"] for f in merged if f.get("metrics")]
    known_costs = [c for c in costs if c is not None]
    return {
        "wall_ms": round(wall_ms, 1),
        "provider": provider,
        "model": model,
        "slowest_reviewer_ms": max(latencies) if latencies else None,
        "mean_reviewer_ms": round(sum(latencies) / len(latencies), 1) if latencies else None,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_usd_estimate": round(sum(known_costs), 8) if known_costs else None,
        "note": ("no tokens: the deterministic engine makes no model call"
                 if prompt_tokens == 0 and completion_tokens == 0 else None),
    }


def analyse_text(db: Session, *, org_id: str, text: str, blocks: list[dict], content_type: str,
                 department: str | None, repeat_runs: int | None = None,
                 adapter=None, honour_exceptions: bool = True) -> tuple[list[dict], dict, dict]:
    """Full review of a text blob. Shared by the API pipeline and the eval harness."""
    kit = active_brand_kit(db, org_id)
    adapter = adapter or get_adapter()
    repeat_runs = max(1, repeat_runs or settings.llm_repeat_runs)
    ctx, _bundle, prep = build_context(
        db, org_id=org_id, kit=kit, text=text, blocks=blocks,
        content_type=content_type, department=department,
    )
    candidates = deterministic_candidates(prep, prep["rules"])
    candidates += reviewer_candidates(adapter, ctx, repeat_runs)
    # `honour_exceptions=False` is used by the labelled-set evaluation, which measures how
    # well the reviewers read brand rules; manager-approved exceptions are an
    # organisation's later policy decisions and must not flatter or distort that score.
    exempted = []
    if honour_exceptions:
        candidates, exempted = apply_exceptions(ctx, candidates)
    merged = merge_findings(text, candidates, repeat_runs)
    prep["exempted"] = exempted
    return merged, prep, {"kit": kit, "adapter": adapter, "repeat_runs": repeat_runs, "candidates": len(candidates)}


def apply_exceptions(ctx, candidates: list[dict]) -> tuple[list[dict], list[dict]]:
    """Drop candidates a manager has already decided are fine in this scope.

    This is where learning takes effect: an approved exception only exists in the scope
    the manager chose, and `build_context` only loads exceptions whose scope matches this
    content — so a blog post is still held to the rule an ad is exempt from.
    """
    kept, exempted = [], []
    for cand in candidates:
        ex = ctx.exempt(cand.get("span_text") or ctx.text[cand["span_start"]:cand["span_end"]],
                        cand.get("category"))
        if ex:
            exempted.append({"span_text": cand.get("span_text"), "issue": cand.get("issue"),
                             "rule_key": ex.get("rule_key"), "exception": ex.get("value")})
            continue
        kept.append(cand)
    return kept, exempted


def build_context(db: Session, *, org_id: str, kit: BrandKit, text: str, blocks: list[dict],
                  content_type: str, department: str | None) -> tuple[ReviewContext, dict, dict]:
    bundle = kit_bundle(db, org_id=org_id, brand_kit_id=kit.id)
    rules = rules_in_scope(db, org_id=org_id, brand_kit_id=kit.id,
                           content_type=content_type, department=department)

    evidence: list[dict] = []
    seen: set[str] = set()
    queries = [f'{r["title"]} {r["body"]}' for r in rules[:14]] + [text[:1200]]
    for q in queries:
        for chunk in retrieve(db, org_id=org_id, brand_kit_id=kit.id, query=q, limit=4):
            if chunk["chunk_id"] not in seen:
                seen.add(chunk["chunk_id"])
                evidence.append(chunk)

    det = deterministic.dedupe_terms(
        deterministic.check_terms(text, bundle["terms"])
    )
    # manager-approved exceptions that apply to *this* content (scope already filtered)
    exceptions = []
    for r in rules:
        value = exception_value(r.get("body"))
        if value:
            exceptions.append({"value": value, "category": r["category"], "rule_key": r["key"],
                               "scope_content_type": r.get("scope_content_type"),
                               "scope_department": r.get("scope_department")})

    ctx = ReviewContext(
        text=text, blocks=blocks, content_type=content_type, department=department,
        rules=rules, terms=bundle["terms"], facts=bundle["facts"], evidence=evidence,
        exceptions=exceptions,
        brand={
            "colours": bundle["palette"], "fonts": bundle["fonts"],
            "logo_version": bundle["logo_version"], "aspect_ratios": bundle["aspect_ratios"],
            "naming_variants": bundle["naming_variants"], "logos": bundle["logos"],
        },
        deterministic_spans=[(d["span_start"], d["span_end"]) for d in det],
    )
    return ctx, bundle, {"bundle": bundle, "rules": rules, "deterministic": det, "evidence": evidence}


# --------------------------------------------------------------------------- #
def merge_findings(text: str, candidates: list[dict], repeat_runs: int) -> list[dict]:
    """Merge duplicates by span overlap, then label and score each finding."""
    clusters: list[list[dict]] = []
    for cand in sorted(candidates, key=lambda c: (c["reviewer"], c["category"], c["span_start"], c["span_end"])):
        placed = False
        for cluster in clusters:
            head = cluster[0]
            same_group = (head["reviewer"] == cand["reviewer"] and head["category"] == cand["category"])
            if same_group and _span_overlap(head, cand) >= 0.5:
                cluster.append(cand)
                placed = True
                break
        if not placed:
            clusters.append([cand])

    merged: list[dict] = []
    for cluster in clusters:
        det_hits = [c for c in cluster if c.get("deterministic")]
        rep = sorted(
            cluster,
            key=lambda c: (
                0 if c.get("deterministic") else 1,
                -SEV_RANK[c["severity"]],
                -len(c.get("span_text", "")),
            ),
        )[0]
        evidence = next((c.get("evidence") for c in cluster if c.get("evidence")), None)
        rule_key = next((c.get("rule_key") for c in cluster if c.get("rule_key")), None)

        runs = len({c.get("run_index", 0) for c in cluster if not c.get("deterministic")})
        agreement = 1.0 if det_hits else round(min(1.0, runs / max(1, repeat_runs)), 3)
        evidence_strength = max([float(c.get("evidence_strength") or 0) for c in cluster] + [0.0])
        if evidence:
            evidence_strength = max(evidence_strength, float(evidence.get("score", 0.0)))
        det_backing = 1.0 if det_hits else 0.0
        confidence = compute_confidence(agreement=agreement, evidence_strength=evidence_strength,
                                        deterministic_backing=det_backing)
        confirmed = bool(det_hits) or any(c.get("direct_contradiction") for c in cluster)
        severity = max((c["severity"] for c in cluster), key=lambda s: SEV_RANK[s])

        span_start, span_end = rep["span_start"], rep["span_end"]
        suggestion = rep.get("suggestion")
        if not _suggestion_is_span_local(text, span_start, span_end, suggestion):
            suggestion = None

        cluster_metrics = [c["metrics"] for c in cluster if c.get("metrics")]
        if cluster_metrics:
            metrics = max(cluster_metrics, key=lambda m: m.get("latency_ms") or 0)
        else:
            metrics = {}

        merged.append({
            "reviewer": rep["reviewer"], "category": rep["category"], "severity": severity,
            "metrics": metrics,
            "label": "confirmed" if confirmed else "possible",
            "confidence": confidence, "confidence_band": band(confidence),
            "human_review_required": confidence < 0.55 or SEV_RANK[severity] >= 3,
            "span_start": span_start, "span_end": span_end,
            "span_text": text[span_start:span_end],
            "issue": rep["issue"], "why": rep["why"], "impact": rep["impact"],
            "suggestion": suggestion, "evidence": evidence, "rule_key": rule_key,
            "deterministic": bool(det_hits), "agreement": agreement,
            "evidence_strength": round(evidence_strength, 3), "deterministic_backing": det_backing,
            "merged_from": len(cluster),
            "dedupe_key": f'{rep["reviewer"]}:{rep["category"]}:{span_start}:{span_end}',
        })
    merged.sort(key=lambda f: (-SEV_RANK[f["severity"]], f["confidence"], f["span_start"]))
    return merged


# --------------------------------------------------------------------------- #
def execute_run(run_id: str) -> None:
    """Background entry point. Opens its own session; never raises to the caller."""
    started = time.time()
    with session_scope() as db:
        run = db.get(AnalysisRun, run_id)
        if run is None:
            return
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        db.flush()
        org_id = run.org_id

        try:
            item = db.get(ContentItem, run.content_item_id)
            version = db.get(ContentVersion, run.content_version_id)
            if item is None or version is None:
                raise RuntimeError("Content item or version missing")
            kit = active_brand_kit(db, org_id)
            adapter = get_adapter()
            repeat_runs = max(1, settings.llm_repeat_runs)

            ctx, bundle, prep = build_context(
                db, org_id=org_id, kit=kit, text=version.body_text, blocks=version.blocks or [],
                content_type=item.content_type, department=item.department,
            )

            run.model_provider = adapter.provider_name
            run.model_name = adapter.model_name
            run.embedding_model = adapter.embedding_model
            run.prompt_version = settings.prompt_version
            run.repeat_runs = repeat_runs
            run.rule_versions = [
                {"key": r["key"], "version": r["version"], "version_id": r["version_id"],
                 "category": r["category"], "requires_approver": r["requires_approver"]}
                for r in prep["rules"]
            ]
            db.flush()

            # --- deterministic first, then six reviewers in parallel -------
            candidates = deterministic_candidates(prep, prep["rules"])
            candidates += reviewer_candidates(adapter, ctx, repeat_runs)
            # manager-approved exceptions apply here too, not only in the eval path
            candidates, exempted = apply_exceptions(ctx, candidates)
            prep["exempted"] = exempted
            merged = merge_findings(version.body_text, candidates, repeat_runs)

            # --- persist ---------------------------------------------------
            db.query(Finding).filter(Finding.analysis_run_id == run.id).delete()
            rule_by_key = {r["key"]: r for r in prep["rules"]}
            for m in merged:
                rule = rule_by_key.get(m["rule_key"]) if m["rule_key"] else None
                db.add(Finding(
                    org_id=org_id, analysis_run_id=run.id, content_item_id=item.id,
                    content_version_id=version.id, reviewer=m["reviewer"], category=m["category"],
                    severity=m["severity"], label=m["label"], confidence=m["confidence"],
                    confidence_band=m["confidence_band"], human_review_required=m["human_review_required"],
                    span_start=m["span_start"], span_end=m["span_end"], span_text=m["span_text"],
                    block_id=_block_for(version.blocks or [], m["span_start"]),
                    issue=m["issue"], why=m["why"],
                    rule_quote=(rule["body"] if rule else None),
                    evidence=m["evidence"], impact=m["impact"], suggestion=m["suggestion"],
                    deterministic=m["deterministic"], rule_id=(rule["rule_id"] if rule else None),
                    rule_key=m["rule_key"], rule_version_id=(rule["version_id"] if rule else None),
                    rule_version=(rule["version"] if rule else None),
                    provider=adapter.provider_name, model=adapter.model_name,
                    prompt_version=settings.prompt_version, agreement=m["agreement"],
                    evidence_strength=m["evidence_strength"],
                    deterministic_backing=m["deterministic_backing"], dedupe_key=m["dedupe_key"],
                    metrics=m.get("metrics") or {},
                ))

            injection = injection_scan(version.body_text)
            by_reviewer: dict[str, int] = {}
            by_severity: dict[str, int] = {}
            for m in merged:
                by_reviewer[m["reviewer"]] = by_reviewer.get(m["reviewer"], 0) + 1
                by_severity[m["severity"]] = by_severity.get(m["severity"], 0) + 1
            run.stats = {
                "findings": len(merged),
                "by_reviewer": by_reviewer,
                "by_severity": by_severity,
                "deterministic": sum(1 for m in merged if m["deterministic"]),
                "possible": sum(1 for m in merged if m["label"] == "possible"),
                "human_review_required": sum(1 for m in merged if m["human_review_required"]),
                "candidates": len(candidates),
                "duplicates_merged": max(0, len(candidates) - len(merged)),
                "injection": injection,
                "duration_ms": int((time.time() - started) * 1000),
                "words": len(re.findall(r"\S+", version.body_text)),
                "evidence_chunks": len(prep["evidence"]),
                "rules_in_scope": len(prep["rules"]),
                "exceptions_applied": len(prep.get("exempted") or []),
                "reviewers": list(REVIEWERS),
                "provider_note": "AI provider and model are recorded on every finding.",
            }
            run.metrics = run_metrics(
                merged, wall_ms=(time.time() - started) * 1000,
                provider=adapter.provider_name, model=adapter.model_name,
            )
            run.status = "complete"
            run.finished_at = datetime.now(timezone.utc)
            db.flush()
        except Exception as exc:
            log.exception("analysis run %s failed", run_id)
            run.status = "failed"
            run.error = f"{type(exc).__name__}: {exc}"
            run.finished_at = datetime.now(timezone.utc)
            db.flush()


def best_snippet(chunk_text: str, span_text: str, *, width: int = 220) -> str:
    """The sentence window in the chunk that actually bears on the finding.

    Showing the top of a chunk is technically a citation but practically useless;
    reviewers need the sentence that supports the call.
    """
    chunk_text = (chunk_text or "").strip()
    if not chunk_text:
        return ""
    span_tokens = set(re.findall(r"[a-z0-9]{4,}", (span_text or "").lower()))
    best, best_score, best_at = chunk_text[:width], -1, 0
    for m in re.finditer(r"[^.!?\n]{10,400}[.!?]?", chunk_text):
        window = m.group(0).strip()
        score = len(span_tokens & set(re.findall(r"[a-z0-9]{4,}", window.lower())))
        if score > best_score:
            best, best_score, best_at = window, score, m.start()
    if best_score <= 0:
        return chunk_text[:width]
    start = max(0, best_at - 40)
    return ("…" if start else "") + chunk_text[start:start + width].strip() + "…"


def _block_for(blocks: list[dict], offset: int) -> str | None:
    for b in blocks:
        if b.get("start", 0) <= offset < b.get("end", 0):
            return b.get("id")
    return None


# A run that has sat in queued/running for longer than this is treated as abandoned:
# the process that owned it is gone (deploy, crash, OOM kill) and it will never finish.
STALE_RUN_MINUTES = 15


def recover_stale_runs(db: Session, *, org_id: str | None = None) -> dict:
    """Fail runs whose worker died, so the UI never polls a ghost for ever.

    Called at startup (every org) and before starting a new run on an item. The runs are
    marked `failed` with a reason instead of being silently requeued: requeueing would
    re-spend money on a hosted provider without a human asking. `POST
    /v1/content/{id}/analyze` is the explicit re-run path the UI already offers.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_RUN_MINUTES)
    query = select(AnalysisRun).where(AnalysisRun.status.in_(("queued", "running")))
    if org_id:
        query = query.where(AnalysisRun.org_id == org_id)
    stale = []
    for run in db.execute(query).scalars().all():
        reference = run.started_at or run.created_at
        if reference is None:
            continue
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)
        if reference > cutoff:
            continue
        run.status = "failed"
        run.error = (f"Abandoned: the worker stopped responding after "
                     f"{round((datetime.now(timezone.utc) - reference).total_seconds() / 60)} minutes. "
                     f"Re-run the review to try again.")
        run.finished_at = datetime.now(timezone.utc)
        stale.append(run.id)
    if stale:
        db.flush()
        log.warning("recovered %s stale analysis runs", len(stale))
    return {"recovered": stale}


def start_run(db: Session, *, org_id: str, item: ContentItem, version: ContentVersion) -> AnalysisRun:
    run = AnalysisRun(
        org_id=org_id, content_item_id=item.id, content_version_id=version.id,
        status="queued", model_provider=get_adapter().provider_name,
        model_name=get_adapter().model_name, embedding_model=get_adapter().embedding_model,
        prompt_version=settings.prompt_version, repeat_runs=max(1, settings.llm_repeat_runs),
    )
    db.add(run)
    db.flush()
    return run
