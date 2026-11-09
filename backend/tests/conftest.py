"""Test harness: isolated SQLite database + storage, seeded workspace."""
from __future__ import annotations

import os
import shutil
import tempfile

import pytest

TMP = tempfile.mkdtemp(prefix="sentinel-tests-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{TMP}/test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{TMP}/test.db"
os.environ["STORAGE_DIR"] = f"{TMP}/storage"
os.environ["SEED_ON_STARTUP"] = "1"
os.environ["LLM_PROVIDER"] = "local"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["LLM_REPEAT_RUNS"] = "2"
os.makedirs(f"{TMP}/storage", exist_ok=True)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def _login(client: TestClient, email: str, password: str = "Sentinel!2026") -> dict:
    resp = client.post("/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture(scope="session")
def tokens(client) -> dict:
    out = {}
    for email in ("ada@northwind.example", "maya@northwind.example", "raj@northwind.example",
                  "tom@northwind.example", "ines@northwind.example", "leo@northwind.example",
                  "sam@northwind.example"):
        payload = _login(client, email)
        out[email] = payload["access_token"]
    return out


@pytest.fixture(scope="session")
def auth(tokens):
    def headers(email: str) -> dict:
        return {"Authorization": f"Bearer {tokens[email]}"}
    return headers


@pytest.fixture(scope="session")
def org(client, auth):
    return client.get("/v1/auth/me", headers=auth("tom@northwind.example")).json()


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(TMP, ignore_errors=True)
