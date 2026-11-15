"""A brand-new workspace must work — not 500, and not fail silently.

The bug this file locks down: a fresh organisation had no `BrandKit` row, and three
different code paths assumed one existed. An image upload returned 500 (it measured the
pixels against the kit's palette), and `POST /content/{id}/analyze` returned 202 and then
died in the background, so the user's only feedback was the word "failed".

Two properties are asserted throughout:

1. nothing is a 500 — a missing kit is a 409 with `code: "no_brand_kit"`, and an upload
   still succeeds because measuring pixels does not need a palette;
2. a review that *does* run says what it could not check. A kit with no confirmed rules
   produces `metrics["no_rules_confirmed"]` with the exact wording the UI repeats.

Both the "new workspace" path and the "existing workspace whose kit vanished" path are
covered, because fixing only the first would leave every organisation created before this
change broken.
"""
from __future__ import annotations

import io
import secrets
import time

import pytest
from PIL import Image
from sqlalchemy import select

from app.models import (
    Asset, BrandKit, Chunk, Document, Fact, Finding, Rule, RuleReviewTask, RuleVersion, Term,
)

LIST_ENDPOINTS = [
    "/v1/brand-kits",
    "/v1/documents",
    "/v1/terms",
    "/v1/facts",
    "/v1/assets",
    "/v1/rules",
    "/v1/content",
    "/v1/findings",
    "/v1/overrides",
    "/v1/regressions",
    "/v1/rule-review-tasks",
    "/v1/rule-review-tasks/count",
    "/v1/audit?limit=20",
    "/v1/analytics/summary",
    "/v1/guideline-changes",
    "/v1/evaluation",
    "/v1/regression/baseline",
    "/v1/organisation",
    "/v1/auth/users",
    "/v1/provider",
    "/v1/demo/status",
]


def png_bytes(size=(800, 800), colour=(30, 60, 140)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, colour).save(buf, format="PNG")
    return buf.getvalue()


def make_workspace(client, prefix: str = "fresh") -> dict:
    """A workspace created through the public setup endpoint, as a real Admin would."""
    suffix = secrets.token_hex(4)
    slug = f"{prefix}-{suffix}"
    resp = client.post("/v1/auth/workspace", json={
        "org_name": f"{prefix.title()} Co {suffix}",
        "slug": slug,
        "admin_email": f"admin@{suffix}.example",
        "admin_name": f"{prefix.title()} Admin",
        "admin_password": "Sentinel!2026",
        "departments": ["Marketing", "Product"],
    })
    assert resp.status_code == 201, resp.text
    return {"headers": {"Authorization": f"Bearer {resp.json()['access_token']}"},
            "slug": slug, "email": f"admin@{suffix}.example"}


@pytest.fixture(scope="module")
def new_workspace(client):
    """One workspace for the read-only "fresh" checks; nothing here deletes its kit."""
    return make_workspace(client, "fresh")


@pytest.fixture()
def sample_workspace(client):
    """Its own workspace per test, so one test's deletions cannot order-depend another."""
    ws = make_workspace(client, "sample")
    kit = client.get("/v1/brand-kits", headers=ws["headers"]).json()[0]
    loaded = client.post(f"/v1/brand-kits/{kit['id']}/sample", headers=ws["headers"])
    assert loaded.status_code == 200, loaded.text
    ws["kit"] = kit
    return ws


def _wait_for_run(client, headers, run_id: str, timeout: float = 25.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/v1/analysis-runs/{run_id}", headers=headers).json()
        if run["status"] in ("complete", "failed"):
            return run
        time.sleep(0.2)
    raise AssertionError(f"run {run_id} never finished: {run['status']}")


# --------------------------------------------------------------------------- #
# 1. a fresh workspace answers every list endpoint
# --------------------------------------------------------------------------- #
def test_new_workspace_has_a_brand_kit_created_for_it(client, new_workspace):
    """The setup endpoint creates a draft kit, so nothing downstream meets a bare org."""
    kits = client.get("/v1/brand-kits", headers=new_workspace["headers"]).json()
    assert len(kits) == 1
    assert kits[0]["name"] == "Brand Kit"
    assert kits[0]["status"] == "draft"
    assert kits[0]["rules"] == 0


@pytest.mark.parametrize("path", LIST_ENDPOINTS)
def test_every_list_endpoint_answers_on_a_fresh_workspace(client, new_workspace, path):
    resp = client.get(path, headers=new_workspace["headers"])
    assert resp.status_code == 200, f"{path} -> {resp.status_code}: {resp.text[:300]}"


# --------------------------------------------------------------------------- #
# 2. upload and analyse an image
# --------------------------------------------------------------------------- #
def test_image_upload_succeeds_and_the_original_can_be_read_back(client, new_workspace):
    resp = client.post("/v1/content/upload", headers=new_workspace["headers"],
                       files={"file": ("fresh.png", png_bytes(), "image/png")},
                       data={"title": "Fresh image", "content_type": "social_post"})
    assert resp.status_code == 201, resp.text
    item = resp.json()

    original = client.get(f"/v1/content/{item['id']}/original", headers=new_workspace["headers"])
    assert original.status_code == 200
    assert original.headers["content-type"] == "image/png"
    assert original.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_analyse_with_a_kit_but_no_confirmed_rules_completes(client, new_workspace):
    """The review runs, finishes, and states the limit of what it could check."""
    up = client.post("/v1/content/upload", headers=new_workspace["headers"],
                     files={"file": ("fresh2.png", png_bytes((600, 600), (200, 90, 40)), "image/png")},
                     data={"title": "Second fresh image", "content_type": "social_post"})
    assert up.status_code == 201, up.text
    item_id = up.json()["id"]

    started = client.post(f"/v1/content/{item_id}/analyze", headers=new_workspace["headers"])
    assert started.status_code == 202, started.text

    run = _wait_for_run(client, new_workspace["headers"], started.json()["id"])
    assert run["status"] == "complete", run.get("error")
    assert run["error"] is None
    note = (run.get("metrics") or {}).get("no_rules_confirmed")
    assert note, "a run with no confirmed rules must say so on the run itself"
    assert note["note"] == "no rules confirmed; results limited to built-in checks"
    assert note["count"] == 0


def test_pasted_text_analyse_completes_too(client, new_workspace):
    item = client.post("/v1/content", headers=new_workspace["headers"], json={
        "title": "Fresh draft", "content_type": "blog",
        "text": "Our revolutionary platform is guaranteed to transform everything.",
    }).json()
    started = client.post(f"/v1/content/{item['id']}/analyze", headers=new_workspace["headers"])
    assert started.status_code == 202
    run = _wait_for_run(client, new_workspace["headers"], started.json()["id"])
    assert run["status"] == "complete", run.get("error")


# --------------------------------------------------------------------------- #
# 3. an ORGANISATION WITH NO KIT ROW AT ALL
# --------------------------------------------------------------------------- #
@pytest.fixture()
def kitless(client, sample_workspace):
    """An existing organisation whose kit has gone — the pre-fix state, reproduced.

    Every organisation created before this change is in exactly this position, so the fix
    has to hold here too, not only at signup. The workspace starts full (a loaded sample)
    so the deletion has real children to remove, which is the harder version.
    """
    from app.db import session_scope

    org_id = _org_id(client, sample_workspace)
    with session_scope() as db:
        kit_ids = [k.id for k in db.execute(
            select(BrandKit).where(BrandKit.org_id == org_id)).scalars().all()]
        assert kit_ids, "this fixture needs a kit to remove"
        # Children first: rules carry versions, documents carry chunks, terms and facts
        # point at both. Deleting these rows is how an organisation ends up in the state
        # the pre-fix code could not survive.
        rule_ids = [r.id for r in db.execute(select(Rule).where(Rule.org_id == org_id)).scalars().all()]
        if rule_ids:
            db.query(RuleVersion).filter(RuleVersion.rule_id.in_(rule_ids)).delete(synchronize_session=False)
        for model in (Finding, Term, Fact, Asset, Chunk, RuleVersion, Rule, Document, RuleReviewTask):
            db.query(model).filter(model.org_id == org_id).delete(synchronize_session=False)
        db.query(BrandKit).filter(BrandKit.org_id == org_id).delete(synchronize_session=False)
        db.flush()
    assert client.get("/v1/brand-kits", headers=sample_workspace["headers"]).json() == []
    return sample_workspace


def _org_id(client, workspace) -> str:
    return client.get("/v1/auth/me", headers=workspace["headers"]).json()["organisation"]["id"]


def test_upload_without_any_kit_does_not_500(client, kitless):
    """Measuring pixels needs no palette. The upload must survive a missing kit."""
    resp = client.post("/v1/content/upload", headers=kitless["headers"],
                       files={"file": ("kitless.png", png_bytes((500, 500)), "image/png")},
                       data={"title": "No kit image", "content_type": "social_post"})
    assert resp.status_code == 201, resp.text
    assert client.get(f"/v1/content/{resp.json()['id']}/original",
                      headers=kitless["headers"]).status_code == 200


def test_analyze_without_any_kit_is_a_clear_409_before_queueing(client, kitless):
    """409 with a code, returned immediately — not a 202 followed by a silent failure."""
    item = client.post("/v1/content", headers=kitless["headers"], json={
        "title": "No kit draft", "content_type": "social_post",
        "text": "This draft will be analysed by a workspace that has no Brand Kit.",
    }).json()

    resp = client.post(f"/v1/content/{item['id']}/analyze", headers=kitless["headers"])
    assert resp.status_code == 409, resp.text
    body = resp.json()
    assert body["code"] == "no_brand_kit"
    assert "Brand Kit" in body["detail"]

    # and no half-started run was left behind for the UI to poll for ever
    fresh = client.get(f"/v1/content/{item['id']}", headers=kitless["headers"]).json()
    assert fresh["active_run_id"] is None


def test_no_kit_never_returns_500_anywhere_it_matters(client, kitless):
    """The three paths that used to assume a kit all answer politely."""
    assert client.get("/v1/brand-kits", headers=kitless["headers"]).status_code == 200
    item = client.post("/v1/content", headers=kitless["headers"], json={
        "title": "Another", "content_type": "ad", "text": "Short ad copy for a kitless workspace.",
    }).json()
    for path in (f"/v1/content/{item['id']}/analyze", f"/v1/content/{item['id']}/report.pdf"):
        assert client.post(path, headers=kitless["headers"]).status_code != 500
    up = client.post("/v1/content/upload", headers=kitless["headers"],
                     files={"file": ("k.png", png_bytes((320, 320)), "image/png")},
                     data={"title": "Third", "content_type": "social_post"})
    assert up.status_code != 500


# --------------------------------------------------------------------------- #
# 4. the sample kit
# --------------------------------------------------------------------------- #
def test_sample_kit_fills_an_empty_kit_and_is_labelled(client, sample_workspace):
    kit = sample_workspace["kit"]
    kits = client.get("/v1/brand-kits", headers=sample_workspace["headers"]).json()
    loaded = [k for k in kits if k["id"] == kit["id"]][0]
    assert "(sample)" in loaded["name"]
    assert loaded["rules"] > 0 and loaded["terms"] > 0 and loaded["facts"] > 0

    # every asset says sample in its own metadata, not only in the kit name
    assets = client.get("/v1/assets", headers=sample_workspace["headers"]).json()
    assert assets and all(a["meta"].get("sample") for a in assets)
    # and every rule carries a sample reason, so a reader can tell where it came from
    rules = client.get("/v1/rules", headers=sample_workspace["headers"]).json()
    assert rules


def test_sample_kit_refuses_to_overwrite_real_content(client, sample_workspace):
    again = client.post(f"/v1/brand-kits/{sample_workspace['kit']['id']}/sample",
                        headers=sample_workspace["headers"])
    assert again.status_code == 409
    assert "already has content" in again.json()["detail"]


def test_review_after_loading_the_sample_finds_real_things(client, sample_workspace):
    """A sample kit makes the reviewers useful immediately — and no 'no rules' note."""
    item = client.post("/v1/content", headers=sample_workspace["headers"], json={
        "title": "Sample-driven draft", "content_type": "social_post",
        "text": "Our cheap platform lets you leverage synergy and guarantees results for everyone.",
    }).json()
    started = client.post(f"/v1/content/{item['id']}/analyze", headers=sample_workspace["headers"])
    assert started.status_code == 202, started.text
    run = _wait_for_run(client, sample_workspace["headers"], started.json()["id"])
    assert run["status"] == "complete", run.get("error")
    assert run["findings"], "with the sample kit loaded there are rules to violate"
    assert "no_rules_confirmed" not in (run.get("metrics") or {})


# --------------------------------------------------------------------------- #
# 5. nothing above invented a number
# --------------------------------------------------------------------------- #
def test_no_kit_tenant_never_reports_a_fabricated_score(client, kitless):
    """Analytics on an empty workspace must show absence, not a flattering default."""
    summary = client.get("/v1/analytics/summary", headers=kitless["headers"]).json()
    assert summary["submissions"] == 0
    assert summary["average_approval_hours"] is None
