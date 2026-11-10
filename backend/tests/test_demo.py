"""One-click demo: idempotency, progress states, tenant isolation and the DEMO_MODE gate."""
from __future__ import annotations

import time

from app.config import settings
from app.ratelimit import reset as reset_rate_limit


def _counts(client, headers) -> dict:
    items = client.get("/v1/content", headers=headers).json()
    return {"items": len(items)}


def test_demo_status_is_available_without_a_token(client):
    resp = client.get("/v1/demo/status")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["state"] in ("idle", "loading", "running", "done", "error")
    assert body["demo_mode"] is True
    for key in ("total", "analysed", "findings", "started_at", "finished_at", "errors"):
        assert key in body


def test_demo_load_populates_then_reports_done(client, auth):
    reset_rate_limit("demo")
    resp = client.post("/v1/demo/load?background=false")
    assert resp.status_code == 200, resp.text

    status = client.get("/v1/demo/status").json()
    assert status["state"] == "done", status
    assert status["total"] >= 12
    assert status["analysed"] >= 12
    assert status["findings"] > 0, "the demo must arrive with real findings"
    assert status["errors"] == []
    assert status["started_at"] and status["finished_at"]

    # the seeded story is present: approvals, overrides and a promoted rule
    manager = auth("tom@northwind.example")
    assert client.get("/v1/overrides", headers=manager).json(), "learning page must not be empty"
    rules = client.get("/v1/rules", headers=manager).json()
    assert any(r["current_version"] >= 2 for r in rules), "a promoted rule version is expected"


def test_demo_load_is_idempotent(client, auth):
    reset_rate_limit("demo")
    client.post("/v1/demo/load?background=false")
    admin = auth("ada@northwind.example")
    first = _counts(client, admin)
    findings_first = client.get("/v1/demo/status").json()["findings"]

    second = client.post("/v1/demo/load?background=false").json()
    assert second["started"] is False, "second load must not re-run the work"
    assert _counts(client, admin) == first
    assert client.get("/v1/demo/status").json()["findings"] == findings_first


def test_demo_status_transitions_are_forward_only(client):
    reset_rate_limit("demo")
    client.post("/v1/demo/load?background=false")
    seen = []
    for _ in range(40):
        state = client.get("/v1/demo/status").json()["state"]
        if not seen or seen[-1] != state:
            seen.append(state)
        if state == "done":
            break
        time.sleep(0.05)
    assert seen[-1] == "done", seen
    # a synchronous load goes straight to done; an async one walks loading -> running -> done
    assert set(seen) <= {"loading", "running", "done"}


def test_demo_reset_removes_demo_rows_only(client, auth):
    reset_rate_limit("demo")
    client.post("/v1/demo/load?background=false")
    admin = auth("ada@northwind.example")
    before = len(client.get("/v1/content", headers=admin).json())
    assert before > 0

    resp = client.post("/v1/demo/reset", headers=admin)
    assert resp.status_code == 200, resp.text
    assert resp.json()["deleted_content"] == before
    assert client.get("/v1/content", headers=admin).json() == []
    # the Brand Kit survives a reset: only content is demo-flagged
    assert client.get("/v1/brand-kits", headers=admin).json()
    assert client.get("/v1/demo/status").json()["state"] == "idle"

    # and loading again rebuilds it
    reset_rate_limit("demo")
    client.post("/v1/demo/load?background=false")
    assert len(client.get("/v1/content", headers=admin).json()) == before


def test_demo_reset_is_denied_for_another_organisation(client, auth):
    """Tenant isolation: a real workspace must never be wiped by the demo button."""
    created = client.post("/v1/auth/workspace", json={
        "org_name": "Fabrikam", "slug": "fabrikam-demo-test", "admin_name": "Fran",
        "admin_email": "fran@fabrikam.example", "admin_password": "Password!2026",
    })
    assert created.status_code in (200, 201), created.text
    token = client.post("/v1/auth/login", json={
        "email": "fran@fabrikam.example", "password": "Password!2026"}).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}

    resp = client.post("/v1/demo/reset", headers=other)
    assert resp.status_code == 403

    # the demo workspace is untouched
    reset_rate_limit("demo")
    client.post("/v1/demo/load?background=false")
    assert client.get("/v1/demo/status").json()["state"] == "done"


def test_demo_endpoints_are_404_when_demo_mode_is_off(client, monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", False)
    try:
        assert client.get("/v1/demo/status").status_code == 404
        assert client.post("/v1/demo/load").status_code == 404
        assert client.post("/v1/demo/reset").status_code == 404
    finally:
        monkeypatch.undo()


def test_demo_load_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr(settings, "demo_rate_limit_per_minute", 2)
    reset_rate_limit("demo")
    try:
        codes = [client.post("/v1/demo/load?background=false").status_code for _ in range(4)]
        assert 429 in codes, codes
    finally:
        reset_rate_limit("demo")
        monkeypatch.undo()


def test_demo_status_ignores_real_content(client, auth):
    """A real submission must not make the demo panel look loaded (or, after a reset, done)."""
    reset_rate_limit("demo")
    admin = auth("ada@northwind.example")
    client.post("/v1/demo/reset", headers=admin)
    idle = client.get("/v1/demo/status").json()
    assert idle["state"] == "idle"
    assert idle["total"] == 0

    created = client.post("/v1/content", headers=admin, json={
        "title": "Real, not demo", "content_type": "blog", "department": "Marketing",
        "text": "A real submission from a real team that has nothing to do with the demo.",
    })
    assert created.status_code == 201, created.text
    item_id = created.json()["id"]
    try:
        status = client.get("/v1/demo/status").json()
        assert status["total"] == 0, "the demo panel must count demo content only"
        assert status["state"] == "idle"
    finally:
        client.delete(f"/v1/content/{item_id}", headers=admin)
