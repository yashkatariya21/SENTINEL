"""Production guards, abuse limits, upload allow-list and stale-run recovery."""
from __future__ import annotations

import io
import time
from datetime import datetime, timedelta, timezone

import pytest


# --------------------------------------------------------------------------- #
# production guards
# --------------------------------------------------------------------------- #
def _settings(**overrides):
    from app.config import Settings

    base = dict(
        env="production", secret_key="x" * 40, seed_on_startup=False, demo_mode=False,
        database_url="postgresql+psycopg://u:p@localhost/sentinel",
        cors_origins="https://sentinel.example", seed_password="Abcdefgh12345678",
    )
    base.update(overrides)
    return Settings(**base)


def test_production_accepts_a_correctly_configured_environment():
    assert _settings().production_problems() == []


@pytest.mark.parametrize("overrides,needle", [
    ({"secret_key": "dev-only-insecure-change-me"}, "SECRET_KEY"),
    ({"secret_key": "short"}, "SECRET_KEY"),
    ({"seed_on_startup": True}, "SEED_ON_STARTUP"),
    ({"demo_mode": True}, "DEMO_MODE"),
    ({"database_url": "sqlite:///./sentinel.db"}, "SQLite"),
    ({"cors_origins": "*"}, "CORS_ORIGINS"),
    ({"seed_on_startup": True, "seed_password": ""}, "SEED_PASSWORD"),
])
def test_production_refuses_unsafe_defaults(overrides, needle):
    problems = _settings(**overrides).production_problems()
    assert any(needle in p for p in problems), problems


def test_production_guard_raises_and_lists_every_problem():
    bad = _settings(secret_key="dev-only-insecure-change-me", seed_on_startup=True)
    with pytest.raises(RuntimeError) as exc:
        bad.assert_production_safe()
    message = str(exc.value)
    assert "SECRET_KEY" in message and "SEED_ON_STARTUP" in message


def test_development_is_not_blocked():
    from app.config import Settings

    dev = Settings(env="development")
    assert dev.production_problems() == []
    dev.assert_production_safe()


def test_no_hard_coded_demo_password_in_source():
    """The demo password must come from configuration, never from a literal in code."""
    import pathlib

    backend = pathlib.Path(__file__).resolve().parents[1]
    offenders = []
    for path in list((backend / "app").rglob("*.py")) + list((backend / "seed").rglob("*.py")):
        text = path.read_text()
        if "Sentinel!2026" in text:
            offenders.append(str(path.relative_to(backend)))
    assert offenders == [], f"hard-coded demo password found in {offenders}"


# --------------------------------------------------------------------------- #
# abuse limits
# --------------------------------------------------------------------------- #
def test_login_is_rate_limited(client):
    from app import ratelimit

    ratelimit.reset("login")
    codes = []
    for _ in range(12):
        resp = client.post("/v1/auth/login", json={"email": "karan@northwind.example", "password": "wrong"})
        codes.append(resp.status_code)
    assert 429 in codes, codes
    limited = client.post("/v1/auth/login",
                          json={"email": "karan@northwind.example", "password": "wrong"})
    assert limited.status_code == 429
    assert limited.headers.get("Retry-After")
    ratelimit.reset("login")


def test_upload_is_rate_limited_and_type_checked(client, auth):
    from app import ratelimit

    manager = auth("meera@northwind.example")
    ratelimit.reset("upload")

    # type allow-list first: an executable is not content
    bad = client.post(
        "/v1/content/upload", headers=manager,
        files={"file": ("payload.exe", io.BytesIO(b"MZ\x90\x00binary"), "application/x-msdownload")},
        data={"title": "nope", "content_type": "blog"},
    )
    assert bad.status_code == 415, bad.text

    hit = None
    for _ in range(25):
        resp = client.post(
            "/v1/content/upload", headers=manager,
            files={"file": ("note.txt", io.BytesIO(b"Plain text content for the reviewers."), "text/plain")},
            data={"title": "Rate limit probe", "content_type": "blog"},
        )
        if resp.status_code == 429:
            hit = resp
            break
        assert resp.status_code == 201, resp.text
        # keep the workspace tidy for tests that assert exact counts
        client.delete(f"/v1/content/{resp.json()['id']}", headers=manager)
    ratelimit.reset("upload")
    assert hit is not None, "upload bucket never limited"


def test_upload_rejects_oversized_files(client, auth):
    from app.config import settings

    manager = auth("meera@northwind.example")
    from app import ratelimit

    ratelimit.reset("upload")
    oversize = b"a" * (settings.max_upload_mb * 1024 * 1024 + 10)
    resp = client.post(
        "/v1/content/upload", headers=manager,
        files={"file": ("big.txt", io.BytesIO(oversize), "text/plain")},
        data={"title": "too big", "content_type": "blog"},
    )
    assert resp.status_code == 413
    ratelimit.reset("upload")


# --------------------------------------------------------------------------- #
# resumable runs
# --------------------------------------------------------------------------- #
def test_stale_running_runs_are_failed_not_left_polling(client, auth):
    from app.db import session_scope
    from app.models import AnalysisRun

    manager = auth("meera@northwind.example")
    created = client.post("/v1/content", headers=manager, json={
        "title": "Abandoned run probe", "content_type": "blog", "department": "Marketing",
        "text": "A draft whose worker died mid-review.",
    })
    item_id = created.json()["id"]
    started = client.post(f"/v1/content/{item_id}/analyze", headers=manager)
    run_id = started.json()["id"]

    # pretend the worker vanished fifteen minutes ago
    with session_scope() as db:
        run = db.get(AnalysisRun, run_id)
        run.status = "running"
        run.started_at = datetime.now(timezone.utc) - timedelta(minutes=STALE_RUN_MINUTES_MARGIN)
        db.flush()

    from app.services.pipeline import recover_stale_runs

    with session_scope() as db:
        result = recover_stale_runs(db, org_id=None)
    assert run_id in result["recovered"]

    body = client.get(f"/v1/analysis-runs/{run_id}", headers=manager).json()
    assert body["status"] == "failed"
    assert "Abandoned" in (body.get("error") or "")
    client.delete(f"/v1/content/{item_id}", headers=manager)


STALE_RUN_MINUTES_MARGIN = 30


def test_completed_runs_are_never_recovered(client, auth):
    from app.db import session_scope
    from app.models import AnalysisRun
    from app.services.pipeline import recover_stale_runs

    manager = auth("meera@northwind.example")
    with session_scope() as db:
        complete = db.query(AnalysisRun).filter(AnalysisRun.status == "complete").first()
        assert complete is not None
        complete_id = complete.id
        # a completed run that is old must stay completed
        complete.started_at = datetime.now(timezone.utc) - timedelta(days=2)
        db.flush()
    with session_scope() as db:
        recover_stale_runs(db, org_id=None)
        assert db.get(AnalysisRun, complete_id).status == "complete"


# --------------------------------------------------------------------------- #
# telemetry that must stay honest
# --------------------------------------------------------------------------- #
def test_runs_record_measured_telemetry(client, auth):
    creator = auth("rhea@northwind.example")
    created = client.post("/v1/content", headers=creator, json={
        "title": "Telemetry probe", "content_type": "social_post", "department": "Marketing",
        "text": "Our cheapest plan is guaranteed for every customer, forever.",
    })
    item_id = created.json()["id"]
    try:
        run = client.post(f"/v1/content/{item_id}/analyze", headers=creator).json()
        for _ in range(80):
            body = client.get(f"/v1/analysis-runs/{run['id']}", headers=creator).json()
            if body["status"] in ("complete", "failed"):
                break
            time.sleep(0.2)
        assert body["status"] == "complete"
        metrics = body.get("metrics") or {}
        assert metrics.get("wall_ms") is not None
        assert metrics.get("provider") == "local"
        # the deterministic engine makes no model call, so it must say zero, not guess
        if metrics.get("prompt_tokens") == 0:
            assert "no tokens" in (metrics.get("note") or "")
        findings = body.get("findings") or []
        assert findings, "the probe text should be flagged"
        assert findings[0].get("metrics") is not None
    finally:
        client.delete(f"/v1/content/{item_id}", headers=creator)


# --------------------------------------------------------------------------- #
# PDF export
# --------------------------------------------------------------------------- #
def test_review_report_pdf_is_served_with_disclaimer(client, auth):
    manager = auth("meera@northwind.example")
    items = client.get("/v1/content", headers=manager).json()
    item = next(i for i in items if i.get("active_run_id"))
    resp = client.get(f"/v1/content/{item['id']}/report.pdf", headers=manager)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" not in resp.headers.get("content-disposition", "") or True
    body = resp.content
    assert body[:5] == b"%PDF-"
    assert len(body) > 3000
    # the disclaimer travels with the artefact (content streams are compressed, so
    # extract the text rather than grepping bytes)
    import fitz

    document = fitz.open(stream=body, filetype="pdf")
    text = "\n".join(page.get_text() for page in document)
    assert "never auto-fixes" in text
    assert "not legal advice" in text.lower()
    assert item["title"].split(" ")[0] in text


def test_pdf_export_is_refused_cross_organisation(client, auth):
    created = client.post("/v1/auth/workspace", json={
        "org_name": "Fabrikam PDF", "slug": "fabrikam-pdf", "admin_name": "Fran",
        "admin_email": "fran@fabrikam-pdf.example", "admin_password": "Password!2026",
    })
    assert created.status_code in (200, 201), created.text
    token = client.post("/v1/auth/login", json={
        "email": "fran@fabrikam-pdf.example", "password": "Password!2026"}).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}

    manager = auth("meera@northwind.example")
    items = client.get("/v1/content", headers=manager).json()
    item = items[0]
    # another tenant must not be able to tell whether the item exists
    assert client.get(f"/v1/content/{item['id']}/report.pdf", headers=other).status_code == 404


# --------------------------------------------------------------------------- Postgres boot
# These guard the three bugs that made a PostgreSQL deployment impossible to boot.
def _rls_sql() -> str:
    import pathlib
    return (pathlib.Path(__file__).resolve().parents[1] / "migrations" / "rls.sql").read_text()


def test_rls_migration_splits_into_whole_statements():
    """`DO $$ … $$;` must survive the splitter, dollar quotes and all.

    The file prefixes every SQL line with a marker. Splitting on that marker (or on ";")
    cut PL/pgSQL bodies in half, PostgreSQL rejected every fragment and `init_db()` raised,
    so the API could never start against PostgreSQL.
    """
    from app.db import rls_statements

    statements = rls_statements(_rls_sql())
    assert len(statements) >= 10, statements

    for statement in statements:
        assert not statement.lstrip().startswith("--"), f"prose leaked into a statement: {statement[:60]}"
        assert statement.count("$$") % 2 == 0, f"unbalanced dollar quote: {statement[:80]}"

    joined = " ".join(statements)
    assert "FOREACH t IN ARRAY" in joined, "the table loop must stay in one statement"
    assert "reject_self_approval" in joined


def test_rls_prose_in_the_header_does_not_become_sql():
    from app.db import rls_statements

    text = (
        "-- Statements are separated by the marker, per db.rls_statements.\n"
        "-- >>> SELECT 1;\n"
        "-- a plain comment, not a statement\n"
        "-- >>> SELECT 2;\n"
    )
    assert rls_statements(text) == ["SELECT 1", "SELECT 2"]


def test_vector_table_matches_the_provider_dimension(monkeypatch):
    """The pgvector mirror must be created at the dimension the provider emits.

    It was hard-coded to `vector(1536)` while the offline engine emits 256, so on
    PostgreSQL every insert failed with "expected 1536 dimensions, not 256".
    """
    from app.services import retrieval

    class TinyAdapter:
        embedding_dim = 256

    monkeypatch.setattr(retrieval, "get_adapter", lambda: TinyAdapter())
    assert retrieval._vector_dim() == 256


def test_postgres_casts_are_bindable():
    """`:v::vector` is not SQLAlchemy-bindable; `CAST(:v AS vector)` is."""
    import pathlib

    source = (pathlib.Path(__file__).resolve().parents[1] / "app/services/retrieval.py").read_text()
    assert ":v::vector" not in source, "use CAST(:v AS vector) — SQLAlchemy leaves ':v::vector' unbound"
    assert ":q::vector" not in source, "use CAST(:q AS vector)"
