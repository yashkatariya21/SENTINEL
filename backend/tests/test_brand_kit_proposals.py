"""Brand Kit proposal lifecycle: extraction → Admin confirmation → live rules.

These cover the "the AI proposes, a human decides" guarantee and the idempotency of
re-extraction.
"""
from __future__ import annotations

import io
import uuid

# Deliberately worded so nothing here duplicates the seeded Northwind kit: the point of the
# test is that *new* material arrives as proposals, not that it overwrites live rules.
GUIDELINE = b"""Larkspur Partner Addendum

1. Partner tone
Address partners as colleagues and keep sentences under twenty words.
Spell out every acronym the first time it appears in partner material.

2. Partner marks
Co-branded headers place our mark left of the partner mark, never right.
Partner decks use the Spring palette only, and never Layer stack gradients.
"""


def _active_kit(client, auth) -> str:
    kits = client.get("/v1/brand-kits", headers=auth("maya@northwind.example")).json()
    return next(k["id"] for k in kits if k["status"] == "active")


def _upload(client, auth, text: bytes = GUIDELINE) -> dict:
    resp = client.post(
        "/v1/documents",
        headers=auth("maya@northwind.example"),
        files={"file": ("voice-guide-test.txt", io.BytesIO(text), "text/plain")},
        data={"kind": "guideline", "brand_kit_id": _active_kit(client, auth)},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_extracted_items_are_proposed_not_live(client, auth):
    # unique wording per run so another test confirming an earlier upload cannot mask this check
    tag = uuid.uuid4().hex[:8]
    _upload(client, auth, GUIDELINE + f"\n3. Review tag\nEvery draft carries the tag {tag} in its footer.\n".encode())
    kit = _active_kit(client, auth)
    proposals = client.get(f"/v1/brand-kits/{kit}/proposals", headers=auth("maya@northwind.example")).json()
    assert proposals["rules"], "extraction should propose at least one rule"
    # a proposal is not a rule yet: the live rule list must not contain it
    live = {r["body"] for r in client.get("/v1/rules", headers=auth("maya@northwind.example")).json()}
    for item in proposals["rules"]:
        assert item["body"] not in live


def test_admin_confirmation_turns_a_proposal_into_a_live_rule(client, auth):
    _upload(client, auth)
    kit = _active_kit(client, auth)
    proposals = client.get(f"/v1/brand-kits/{kit}/proposals", headers=auth("ada@northwind.example")).json()
    target = proposals["rules"][0]

    # the UI ticks rule ids; the API must accept either the rule id or its version id
    resp = client.post(f"/v1/brand-kits/{kit}/confirm", headers=auth("ada@northwind.example"),
                       json={"ids": [target["id"]], "action": "confirm"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmed"] == 1

    live = client.get("/v1/rules", headers=auth("ada@northwind.example")).json()
    assert any(r["body"] == target["body"] for r in live)


def test_creator_cannot_confirm_or_reject_proposals(client, auth):
    kit = _active_kit(client, auth)
    proposals = client.get(f"/v1/brand-kits/{kit}/proposals",
                           headers=auth("leo@northwind.example")).json()
    ids = [p["id"] for group in proposals.values() for p in group][:3]
    resp = client.post(f"/v1/brand-kits/{kit}/confirm", headers=auth("leo@northwind.example"),
                       json={"ids": ids, "action": "confirm"})
    assert resp.status_code == 403


def test_refresh_is_idempotent(client, auth):
    """Re-deriving proposals must not multiply rows in the review queue."""
    first = client.post(f"/v1/brand-kits/{_active_kit(client, auth)}/refresh-proposals",
                        headers=auth("maya@northwind.example")).json()
    kit = _active_kit(client, auth)
    before = client.get(f"/v1/brand-kits/{kit}/proposals", headers=auth("maya@northwind.example")).json()
    size_before = sum(len(v) for v in before.values())

    second = client.post(f"/v1/brand-kits/{kit}/refresh-proposals",
                         headers=auth("maya@northwind.example")).json()
    after = client.get(f"/v1/brand-kits/{kit}/proposals", headers=auth("maya@northwind.example")).json()
    size_after = sum(len(v) for v in after.values())

    assert size_after == size_before, (size_before, size_after, first, second)
