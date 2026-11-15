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
from ..llm.base import ProviderLimitReached, ReviewContext
from ..llm.factory import get_adapter
from ..llm.local_engine import LocalEngine
from ..llm.pricing import UNPRICED, cost_usd
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
            "cost_basis": "deterministic", "provider": "local", "model": "deterministic",
            "deterministic": True}


def _block_object(blocks: list[dict], offset: int) -> dict | None:
    for block in blocks or []:
        if block.get("start", 0) <= offset < block.get("end", 0):
            return block
    return None


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
            "visual_evidence": d.get("visual_evidence"),
            # B5: a perceptual-hash coincidence is never promoted to "confirmed"
            "possible_only": bool(d.get("possible_only")),
        })
    return out


def candidate_rows(out, ctx: ReviewContext, *, run_index: int, engine, latency_ms: float,
                   prompt_tokens: int, completion_tokens: int) -> list[dict]:
    """Turn one reviewer's ReviewerOutput into merge-ready candidate rows.

    Shared by the live pipeline and by the evaluation harness, so the thing that is
    measured in `eval/run_llm_eval.py` (`full_context`) is the thing that ships —
    same citation check, same metrics shape, same merge input.
    """
    model = getattr(engine, "model_name", "sentinel-local-1")
    cost, basis = cost_usd(model, prompt_tokens, completion_tokens)
    rows: list[dict] = []
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
                "cost_usd": cost,
                "cost_basis": basis,
                "provider": getattr(engine, "provider_name", "local"),
                "model": model,
            },
        })
    return rows


def reviewer_candidates(adapter, ctx: ReviewContext, repeat_runs: int) -> tuple[list[dict], dict]:
    """Six reviewers in parallel, repeated `repeat_runs` times for agreement scoring.

    Returns `(rows, info)`. Two kinds of partial failure are recorded rather than
    hidden:

    * a reviewer that raised is skipped (the other five still report);
    * if the **provider budget** runs out (`ProviderLimitReached` — MAX_CALLS spent or
      a 429 that outlived the backoff), every reviewer still owed an answer is
      finished on the offline engine. `info["fallback"]` then carries the reason, the
      model that refused, and which reviewers were re-run, and it is written into
      `analysis_runs.metrics` so a degraded run can never masquerade as a hosted one.
    """

    def call(engine, reviewer: ReviewerName, run_index: int) -> tuple[list[dict], tuple[str, str] | None]:
        # Measure what actually happened: wall-clock per reviewer call, and the token
        # counters the hosted adapter keeps. The deterministic engine reports zero
        # tokens because it makes no model call — that is a fact, not a zero-fill.
        before_tokens = (getattr(engine, "prompt_tokens", 0), getattr(engine, "completion_tokens", 0))
        started = time.perf_counter()
        try:
            out = engine.review(reviewer, ctx, temperature=run_index)
        except ProviderLimitReached as exc:
            log.warning("reviewer %s hit the provider budget: %s", reviewer, exc.reason)
            return [], ("limit", exc.reason)
        except Exception as exc:  # one reviewer must never kill a run
            log.warning("reviewer %s failed on run %s: %s", reviewer, run_index, type(exc).__name__)
            return [], ("error", type(exc).__name__)
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        after_tokens = (getattr(engine, "prompt_tokens", 0), getattr(engine, "completion_tokens", 0))
        prompt_tokens = max(0, after_tokens[0] - before_tokens[0])
        completion_tokens = max(0, after_tokens[1] - before_tokens[1])
        rows = candidate_rows(out, ctx, run_index=run_index, engine=engine,
                              latency_ms=latency_ms, prompt_tokens=prompt_tokens,
                              completion_tokens=completion_tokens)
        return rows, None

    jobs = [(reviewer, i) for i in range(repeat_runs) for reviewer in REVIEWERS]
    rows: list[dict] = []
    limited: list[tuple[ReviewerName, int]] = []
    failures: dict[str, int] = {}
    limit_reason: str | None = None
    with ThreadPoolExecutor(max_workers=6) as pool:
        for (reviewer, run_index), (batch, failure) in zip(
                jobs, pool.map(lambda job: call(adapter, *job), jobs)):
            rows.extend(batch)
            if failure and failure[0] == "limit":
                limited.append((reviewer, run_index))
                limit_reason = failure[1]
            elif failure:
                failures[failure[1]] = failures.get(failure[1], 0) + 1

    info: dict = {"fallback": False, "budget_limited": bool(limited),
                  "failures": failures,
                  "requested": {"provider": getattr(adapter, "provider_name", "local"),
                                "model": getattr(adapter, "model_name", "sentinel-local-1")}}
    if limited:
        offline = LocalEngine()
        recovered: list[dict] = []
        for reviewer, run_index in limited:
            batch, _failure = call(offline, reviewer, run_index)
            recovered.extend(batch)
        rows.extend(recovered)
        info.update({
            "fallback": True,
            "reason": "provider_limit_reached",
            "detail": limit_reason,
            "fell_back_to": {"provider": offline.provider_name, "model": offline.model_name},
            "reviewers_rerun": sorted({r for r, _ in limited}),
            "findings_recovered": len(recovered),
            "note": ("The hosted model hit its call budget or kept answering HTTP 429, so the "
                     "reviewers it still owed were finished on the offline engine. Findings from "
                     "the two engines name their own provider."),
        })
        log.warning("provider budget reached; recovered %s findings on the local engine", len(recovered))
    return rows, info


def run_metrics(merged: list[dict], *, wall_ms: float, provider: str, model: str) -> dict:
    """Aggregate the per-finding measurements of one run."""
    latencies = [f["metrics"]["latency_ms"] for f in merged if f.get("metrics")]
    prompt_tokens = sum(f["metrics"]["prompt_tokens"] for f in merged if f.get("metrics"))
    completion_tokens = sum(f["metrics"]["completion_tokens"] for f in merged if f.get("metrics"))
    costs = [f["metrics"].get("cost_usd") for f in merged if f.get("metrics")]
    known_costs = [c for c in costs if c is not None]
    bases = sorted({f["metrics"].get("cost_basis") for f in merged if f.get("metrics")} - {None})
    fallback_models = sorted({f["metrics"].get("model") for f in merged
                              if f.get("metrics") and f["metrics"].get("provider") == "local"
                              and f["metrics"].get("model") not in (None, "deterministic")})
    return {
        "wall_ms": round(wall_ms, 1),
        "provider": provider,
        "model": model,
        "slowest_reviewer_ms": max(latencies) if latencies else None,
        "mean_reviewer_ms": round(sum(latencies) / len(latencies), 1) if latencies else None,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        # 0.00 for a free/unpriced model, never null: the basis says which kind of zero.
        "cost_usd_estimate": round(sum(known_costs), 8) if known_costs else 0.0,
        "cost_basis": bases[0] if len(bases) == 1 else (bases or [UNPRICED]),
        "fallback_models": fallback_models,
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
    reviewer_rows, reviewer_info = reviewer_candidates(adapter, ctx, repeat_runs)
    candidates += reviewer_rows
    # `honour_exceptions=False` is used by the labelled-set evaluation, which measures how
    # well the reviewers read brand rules; manager-approved exceptions are an
    # organisation's later policy decisions and must not flatter or distort that score.
    exempted = []
    if honour_exceptions:
        candidates, exempted = apply_exceptions(ctx, candidates)
    merged = merge_findings(text, candidates, repeat_runs)
    prep["exempted"] = exempted
    return merged, prep, {"kit": kit, "adapter": adapter, "repeat_runs": repeat_runs,
                          "candidates": len(candidates), "reviewer_info": reviewer_info}


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
    # B2/B3: checks that need a measurement to exist at all. They fire only for blocks
    # an upload actually sampled (`meta.analysis`), so metadata-only images — and every
    # text sample — are untouched by them.
    det = det + deterministic.image_checks(
        blocks, palette=bundle["palette"], allowed_ratios=bundle["aspect_ratios"],
        content_type=content_type, logos=bundle.get("logos"),
    )
    for finding in det:
        if finding.get("visual_evidence") is None:
            # One helper for both paths, so a word read out of a picture is captioned the
            # same way here and at persist time (including the rule's own remedy).
            located = _span_visual_evidence(blocks, finding)
            if located:
                finding["visual_evidence"] = located
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
        # A "possible" label is a promise: a hash match or another soft signal must never
        # be lifted to confirmed just because a deterministic check produced it (B5).
        confirmed = (not any(c.get("possible_only") for c in cluster)) and (
            bool(det_hits) or any(c.get("direct_contradiction") for c in cluster))
        severity = max((c["severity"] for c in cluster), key=lambda s: SEV_RANK[s])

        span_start, span_end = rep["span_start"], rep["span_end"]
        suggestion = rep.get("suggestion")
        if not _suggestion_is_span_local(text, span_start, span_end, suggestion):
            suggestion = None

        visual_evidence = next((c.get("visual_evidence") for c in cluster
                                if c.get("visual_evidence")), None)
        cluster_metrics = [c["metrics"] for c in cluster if c.get("metrics")]
        if cluster_metrics:
            metrics = max(cluster_metrics, key=lambda m: m.get("latency_ms") or 0)
        else:
            metrics = {}

        merged.append({
            "reviewer": rep["reviewer"], "category": rep["category"], "severity": severity,
            "metrics": metrics,
            "visual_evidence": visual_evidence,
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
            # CONFIDENTIAL: a document marked confidential never leaves the building.
            # The offline engine produces the same strict JSON contract, so the review
            # still happens — it just happens without a third-party call.
            confidential_skip: dict | None = None
            if bool(getattr(item, "confidential", False)) and not isinstance(adapter, LocalEngine):
                confidential_skip = {
                    "external_calls_skipped": True,
                    "reason": "confidential",
                    "would_have_used": {"provider": adapter.provider_name,
                                        "model": adapter.model_name},
                    "used": {"provider": "local", "model": LocalEngine.model_name},
                    "note": ("This content is marked confidential, so no text was sent to a "
                             "hosted model. The review ran on the offline engine."),
                }
                log.info("content %s is confidential; using the offline engine", item.id)
                adapter = LocalEngine()

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
            reviewer_rows, reviewer_info = reviewer_candidates(adapter, ctx, repeat_runs)
            candidates += reviewer_rows
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
                    visual_evidence=m.get("visual_evidence") or _span_visual_evidence(
                        version.blocks or [], m),
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
                "engine_fallback": reviewer_info.get("fallback", False),
                "external_calls_skipped": bool(confidential_skip),
            }
            metrics = run_metrics(
                merged, wall_ms=(time.time() - started) * 1000,
                provider=adapter.provider_name, model=adapter.model_name,
            )
            # A degraded run says so in its own metrics: which reviewers fell back, why,
            # and whether the content was kept offline on purpose.
            metrics["reviewers"] = {
                "failures": reviewer_info.get("failures") or {},
                "budget_limited": reviewer_info.get("budget_limited", False),
            }
            if reviewer_info.get("fallback"):
                metrics["engine_fallback"] = reviewer_info
            if confidential_skip:
                metrics["external_calls_skipped"] = confidential_skip
            run.metrics = metrics
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


def _span_visual_evidence(blocks: list[dict], candidate: dict) -> dict | None:
    """Give a finding the pixels it is about, where that can be established (B3).

    Two cases: a text finding whose words were OCR'd out of a picture (the span is
    located in the word boxes), and a visual finding that points at an image block
    (the whole block is the evidence, with the size that was measured).
    """
    block = _block_object(blocks, candidate.get("span_start", 0))
    if block is None:
        return None
    located = deterministic.visual_evidence_for_span(block, candidate.get("span_text", ""))
    if located:
        # A word in a picture is held to the same rule as a word in the text, so the
        # rule's own remedy travels with the box: measured = what was read,
        # expected = what the reviewer should write instead (when the rule says).
        if candidate.get("suggestion"):
            located["detected_value"]["expected"] = candidate["suggestion"]
        return located
    meta = block.get("meta") or {}
    if block.get("kind") != "image" or not meta.get("width"):
        return None
    measured = f"{meta.get('width')}×{meta.get('height')}px" if meta.get("height") else None
    return {
        "page": int(block.get("page") or 1),
        "bbox_norm": meta.get("bbox") or [0.0, 0.0, 1.0, 1.0],
        "detected_text": (meta.get("ocr_text") or "")[:280],
        "detected_value": {"kind": "pixels", "measured": measured, "expected": None},
        "source": meta.get("source") or "upload",
        "ocr_confidence": meta.get("ocr_confidence"),
    }


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
