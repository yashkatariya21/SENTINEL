"""Workstream A: free-model support, the call cap, the offline fallback, confidential content.

These tests never touch the network. The hosted adapter is exercised through
`HostedLLM._request`, which every test replaces, so what is asserted is *our*
behaviour — the cap, the backoff, the parse contract, the fallback — not a
provider's.
"""
from __future__ import annotations

import json
import time

import pytest

from app.config import settings
from app.llm import pricing
from app.llm.base import ProviderLimitReached, ReviewContext, hashed_embedding
from app.llm.factory import get_adapter
from app.llm.hosted import HostedLLM
from app.llm.local_engine import LocalEngine
from app.schemas import ReviewerFinding, ReviewerOutput


def _hosted(**overrides) -> HostedLLM:
    adapter = HostedLLM("openai_compatible", "llama3.1:8b", "ollama", "http://localhost:11434/v1")
    for key, value in overrides.items():
        setattr(adapter, key, value)
    return adapter


class _Response:
    """Just enough of an httpx response for `_chat` to inspect the status code."""

    def __init__(self, status_code=200, headers=None):
        self.status_code = status_code
        self.headers = headers or {}


def _ok_payload(content: str = '{"findings": []}', prompt=100, completion=20) -> dict:
    return {"choices": [{"message": {"content": content}}],
            "usage": {"prompt_tokens": prompt, "completion_tokens": completion}}


def _raise_http(status: int, headers: dict | None = None):
    """Raise the way httpx does: an exception carrying `.response`."""
    exc = Exception(f"HTTP {status}")
    exc.response = _Response(status, headers)  # type: ignore[attr-defined]
    raise exc


# --------------------------------------------------------------------------- #
# A1 — embedding mode
# --------------------------------------------------------------------------- #
def test_offline_embedding_mode_keeps_the_hashed_vectors():
    adapter = _hosted()
    assert settings.embedding_is_offline is True
    assert adapter.embedding_dim == 256
    assert adapter.embedding_model == "sentinel-hash-embed-1"
    vectors = adapter.embed(["guaranteed results"])
    assert len(vectors) == 1 and len(vectors[0]) == 256
    # same input, same vector: no provider round trip, no drift between runs
    assert vectors[0] == hashed_embedding("guaranteed results", 256)


def test_offline_embeddings_match_the_local_engine_so_retrieval_still_ranks():
    hosted, local = _hosted(), LocalEngine()
    a = hosted.embed(["approved colour palette"])[0]
    b = local.embed(["approved colour palette"])[0]
    assert a == b, "a hosted reviewer with offline embeddings must index identically to local"


# --------------------------------------------------------------------------- #
# A1 — one price table, and a free model is 0.00 not None
# --------------------------------------------------------------------------- #
def test_cost_is_zero_with_a_basis_for_an_unpriced_model():
    cost, basis = pricing.cost_usd("llama3.1:8b", 1234, 567)
    assert cost == 0.0
    assert basis == "unpriced"


def test_cost_uses_the_published_price_for_a_priced_model():
    cost, basis = pricing.cost_usd("gpt-4o-mini", 1_000_000, 1_000_000)
    assert basis == "published list price"
    assert cost == pytest.approx(0.15 + 0.60)


def test_there_is_only_one_price_table():
    import app.services.pipeline as pipeline
    import eval.run_llm_eval as harness

    assert not hasattr(pipeline, "_PRICES")
    assert harness.PRICES is pricing.PRICES


# --------------------------------------------------------------------------- #
# A1 — the call cap and the 429 path
# --------------------------------------------------------------------------- #
def test_chat_raises_provider_limit_reached_at_max_calls(monkeypatch):
    adapter = _hosted()
    monkeypatch.setattr(settings, "max_calls", 1)
    monkeypatch.setattr(adapter, "_request", lambda *a, **k: _ok_payload())
    assert adapter._chat("s", "u") == '{"findings": []}'
    with pytest.raises(ProviderLimitReached):
        adapter._chat("s", "u")
    assert adapter.calls == 1


def test_repeated_429_backs_off_then_raises_provider_limit_reached(monkeypatch):
    adapter = _hosted()
    slept: list[float] = []
    monkeypatch.setattr(time, "sleep", lambda seconds: slept.append(seconds))
    monkeypatch.setattr(settings, "llm_max_retries", 3)
    monkeypatch.setattr(settings, "llm_backoff_seconds", 2.0)
    monkeypatch.setattr(adapter, "_request", lambda *a, **k: _raise_http(429))

    with pytest.raises(ProviderLimitReached):
        adapter._chat("s", "u")

    assert len(slept) == 2, "two backoffs between three attempts, then stop"
    assert slept == sorted(slept), "backoff must grow"
    assert adapter.calls == 0, "a 429 is not a completed call"


def test_a_transport_error_is_not_reported_as_a_budget_problem(monkeypatch):
    adapter = _hosted()
    monkeypatch.setattr(time, "sleep", lambda _s: None)
    monkeypatch.setattr(settings, "llm_max_retries", 2)

    def boom(*_a, **_k):
        raise ConnectionError("no route to host")

    monkeypatch.setattr(adapter, "_request", boom)
    with pytest.raises(RuntimeError) as exc:
        adapter._chat("s", "u")
    assert not isinstance(exc.value, ProviderLimitReached)


# --------------------------------------------------------------------------- #
# A1 — parsing never crashes a run
# --------------------------------------------------------------------------- #
def test_parse_returns_none_instead_of_raising_on_garbage():
    adapter = _hosted()
    assert adapter._parse("legal", "not json at all") is None
    assert adapter._parse("legal", "[1,2,3]") is None


def test_review_retries_once_on_invalid_json_then_discards(monkeypatch):
    adapter = _hosted()
    replies = iter(["I am sorry, I cannot", '{"findings": [], "notes": ["ok"]}'])
    monkeypatch.setattr(adapter, "_chat", lambda *a, **k: next(replies))
    out = adapter.review("legal", ReviewContext(text="x"))
    assert out.findings == [] and out.notes == ["ok"]


def test_review_gives_up_quietly_after_two_bad_replies(monkeypatch):
    adapter = _hosted()
    monkeypatch.setattr(adapter, "_chat", lambda *a, **k: "still not json")
    out = adapter.review("legal", ReviewContext(text="x"))
    assert out.findings == []
    assert any("not valid JSON" in note for note in out.notes)


# --------------------------------------------------------------------------- #
# A1 — the pipeline falls back to the local engine and says so
# --------------------------------------------------------------------------- #
class _LimitAdapter:
    provider_name = "openai_compatible"
    model_name = "llama3.1:8b"
    embedding_model = "sentinel-hash-embed-1"
    embedding_dim = 256

    def __init__(self, allow=2):
        self.allow = allow
        self.seen = 0

    def review(self, reviewer, ctx, *, temperature=0.0):
        self.seen += 1
        if self.seen > self.allow:
            raise ProviderLimitReached(f"MAX_CALLS={self.allow} reached")
        return ReviewerOutput(reviewer=reviewer, findings=[])

    def embed(self, texts):
        return [hashed_embedding(t, 256) for t in texts]


def test_reviewer_candidates_falls_back_to_local_and_records_why():
    from app.services.pipeline import reviewer_candidates

    ctx = ReviewContext(text="Guaranteed results for every customer.", content_type="ad")
    rows, info = reviewer_candidates(_LimitAdapter(allow=2), ctx, repeat_runs=1)

    assert info["fallback"] is True
    assert info["reason"] == "provider_limit_reached"
    assert info["fell_back_to"]["provider"] == "local"
    assert info["reviewers_rerun"], "the reviewers that were cut off are named"
    assert rows, "the local engine still produced findings for the lost reviewers"
    assert any(r["metrics"]["provider"] == "local" for r in rows)


def test_a_reviewer_that_merely_errors_does_not_trigger_the_fallback():
    from app.services.pipeline import reviewer_candidates

    class _Broken(_LimitAdapter):
        def review(self, reviewer, ctx, *, temperature=0.0):
            raise ValueError("bad model output")

    rows, info = reviewer_candidates(_Broken(), ReviewContext(text="hello world"), repeat_runs=1)
    assert info["fallback"] is False
    assert info["failures"].get("ValueError", 0) >= 1
    assert rows == []


# --------------------------------------------------------------------------- #
# A2 — confidential content never reaches a hosted model
# --------------------------------------------------------------------------- #
def test_confidential_content_is_reviewed_offline_and_says_so(client, auth, monkeypatch):
    import app.services.pipeline as pipeline

    class _Hosted:
        provider_name = "openai_compatible"
        model_name = "llama3.1:8b"
        embedding_model = "sentinel-hash-embed-1"
        embedding_dim = 256
        called = 0

        def review(self, reviewer, ctx, *, temperature=0.0):
            type(self).called += 1
            raise AssertionError("a confidential document must never reach the hosted model")

        def embed(self, texts):
            return [hashed_embedding(t, 256) for t in texts]

    monkeypatch.setattr(pipeline, "get_adapter", lambda: _Hosted())

    headers = auth("rhea@northwind.example")
    created = client.post("/v1/content", json={
        "title": "Confidential pricing memo", "content_type": "email",
        "department": "Marketing", "confidential": True,
        "text": "Our cheapest plan costs less than a team lunch. Guaranteed results.",
    }, headers=headers)
    assert created.status_code == 201, created.text
    assert created.json()["confidential"] is True

    resp = client.post(f"/v1/content/{created.json()['id']}/analyze", headers=headers)
    assert resp.status_code == 202, resp.text
    run_id = resp.json()["id"]
    run = {}
    for _ in range(60):
        run = client.get(f"/v1/analysis-runs/{run_id}", headers=headers).json()
        if run["status"] in ("complete", "failed"):
            break
        time.sleep(0.2)

    assert run["status"] == "complete", run.get("error")
    assert _Hosted.called == 0
    skipped = run["metrics"]["external_calls_skipped"]
    assert skipped["external_calls_skipped"] is True
    assert skipped["reason"] == "confidential"
    assert skipped["would_have_used"]["model"] == "llama3.1:8b"
    assert skipped["used"]["provider"] == "local"
    assert run["metrics"]["provider"] == "local"
    assert run["stats"]["external_calls_skipped"] is True


def test_a_normal_document_is_not_marked_as_skipped(client, auth):
    headers = auth("rhea@northwind.example")
    created = client.post("/v1/content", json={
        "title": "Public note", "content_type": "blog", "department": "Marketing",
        "text": "A quiet announcement with no claims in it.",
    }, headers=headers)
    assert created.status_code == 201
    assert created.json()["confidential"] is False


# --------------------------------------------------------------------------- #
# A3 — the harness
# --------------------------------------------------------------------------- #
def test_the_harness_refuses_to_print_metrics_without_a_key(monkeypatch, capsys):
    import eval.run_llm_eval as harness

    monkeypatch.setattr(harness, "_build_adapter", lambda: None)
    monkeypatch.setattr("sys.argv", ["run_llm_eval"])
    code = harness.main()
    captured = capsys.readouterr()
    assert code == 2
    assert not any(word in captured.out.lower() for word in ("precision", "f1", "recall"))


def test_offline_config_needs_no_key_at_all(monkeypatch):
    import eval.run_llm_eval as harness

    monkeypatch.setattr(harness, "_build_adapter", lambda: None)
    results = harness._load_sets("regression", 2)
    assert list(results) == ["regression"]
    assert len(results["regression"]) == 2


def test_full_context_reads_the_shipped_prompt(monkeypatch):
    """The harness must build exactly the prompt the product sends."""
    adapter = _hosted()
    ctx = ReviewContext(text="Guaranteed results.", content_type="ad")
    system, user = adapter.build_prompt("legal", ctx)
    assert "<<<CONTENT>>>" in user and "Guaranteed results." in user
    assert "DATA" in system
    assert json.dumps(ctx.rules) in user or '"rules"' in user


def test_offline_config_scores_the_blind_set_without_a_provider(client):
    import eval.run_llm_eval as harness

    from app.db import session_scope
    from app.models import Organisation
    from seed.blind_samples import BLIND
    from seed.brand_kit import ORG

    with session_scope() as db:
        org = db.query(Organisation).filter(Organisation.slug == ORG["slug"]).first()
        org_id = org.id
        result = harness.run_config(adapter=None, db=db, org_id=org_id, samples=BLIND[:3],
                                    config="offline_engine", use_cache=True,
                                    seed=harness.SEED, repeat_runs=1)

    assert result["config"] == "offline_engine"
    assert result["model"] == "sentinel-local-1"
    assert result["calls"]["total"] == 0
    assert result["cost_usd_estimate"] == 0.0
    assert result["cost_basis"] == "deterministic"
    assert result["samples"] == 3
    assert "confidence_bands" in result


# --------------------------------------------------------------------------- #
# A6 — the confidence bands are measured, not assumed
# --------------------------------------------------------------------------- #
def test_confidence_bands_reports_precision_per_band():
    from eval.metrics import confidence_bands

    samples = [{
        "id": "x", "text": "a b c d e f g h",
        "labels": [{"reviewer": "legal", "start": 0, "end": 3, "type": "t"}],
        "predictions": [
            {"reviewer": "legal", "start": 0, "end": 3, "confidence_band": "high"},
            {"reviewer": "legal", "start": 4, "end": 6, "confidence_band": "low"},
        ],
    }]
    bands = confidence_bands(samples)
    assert bands["high"]["matched"] == 1 and bands["high"]["precision"] == 1.0
    assert bands["low"]["matched"] == 0 and bands["low"]["precision"] == 0.0
    assert bands["comparable"] is False, "two findings is not enough to compare bands"
    assert "Too few findings" in bands["note"]


def test_confidence_bands_admits_when_the_ordering_does_not_hold():
    from eval.metrics import confidence_bands

    predictions, labels = [], []
    for i in range(6):
        start = i * 10
        labels.append({"reviewer": "legal", "start": start, "end": start + 4, "type": "t"})
    # low band is perfect, high band never matches: the ordering is broken on purpose
    for i in range(6):
        predictions.append({"reviewer": "legal", "start": i * 10, "end": i * 10 + 4,
                            "confidence_band": "low"})
    for i in range(6):
        predictions.append({"reviewer": "legal", "start": 100 + i * 10, "end": 104 + i * 10,
                            "confidence_band": "high"})
    for i in range(6):
        predictions.append({"reviewer": "legal", "start": 200 + i * 10, "end": 204 + i * 10,
                            "confidence_band": "medium"})
    bands = confidence_bands([{"id": "x", "text": "t" * 400, "labels": labels,
                               "predictions": predictions}])
    assert bands["low"]["precision"] == 1.0
    assert bands["high"]["precision"] == 0.0
    assert bands["monotonic"] is False
    assert "not" in bands["note"].lower()
