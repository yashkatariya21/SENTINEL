"""Analytics honesty: calibration comes from real decisions, insights are derived not invented."""
from __future__ import annotations

import time


def _summary(client, headers):
    resp = client.get("/v1/analytics/summary", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_summary_exposes_calibration_and_insights(client, auth):
    data = _summary(client, auth("meera@northwind.example"))
    assert [c["band"] for c in data["confidence_calibration"]] == ["low", "medium", "high"]
    for band in data["confidence_calibration"]:
        assert band["findings"] == band["agreed"] + band["disagreed"] + (
            band["findings"] - band["decided"]
        )
        if band["decided"] == 0:
            assert band["agreement_rate"] is None, "no decisions must mean no rate, not 0%"
        else:
            assert 0.0 <= band["agreement_rate"] <= 1.0
    assert isinstance(data["insights"], list)
    for insight in data["insights"]:
        assert insight["text"].strip(), "an insight without text is noise"
        assert "kind" in insight


def test_insights_only_claim_what_the_data_supports(client, auth):
    """A brand-new workspace has no runs, so the only allowed insight is the empty one."""
    admin = auth("ananya@northwind.example")
    data = _summary(client, admin)
    decided = sum(c["decided"] for c in data["confidence_calibration"])
    if decided == 0:
        assert all(c["agreement_rate"] is None for c in data["confidence_calibration"])
    if data["inputs"]["analysed_submissions"] == 0:
        kinds = [i["kind"] for i in data["insights"]]
        assert kinds == ["empty"], f"nothing measured must not produce claims: {kinds}"


def test_calibration_follows_decisions(client, auth):
    """Dismissing a finding moves the calibration denominator for its confidence band."""
    manager = auth("meera@northwind.example")
    before = _summary(client, manager)

    created = client.post("/v1/content", headers=manager, json={
        "title": "Calibration probe", "content_type": "social_post",
        "department": "Marketing",
        "text": "Our cheapest plan is guaranteed for every customer, forever and always.",
    })
    assert created.status_code == 201, created.text
    item_id = created.json()["id"]

    run = client.post(f"/v1/content/{item_id}/analyze", headers=manager)
    assert run.status_code == 202, run.text
    run_id = run.json()["id"]
    findings = []
    for _ in range(80):
        body = client.get(f"/v1/analysis-runs/{run_id}", headers=manager).json()
        if body["status"] in ("complete", "failed"):
            findings = body.get("findings", [])
            break
        time.sleep(0.2)
    assert findings, "the probe text should be flagged"

    target = findings[0]
    decision = client.post(
        f"/v1/findings/{target['id']}/decision", headers=manager,
        json={"action": "accept"},
    )
    assert decision.status_code == 200, decision.text

    after = _summary(client, manager)
    band = next(c for c in after["confidence_calibration"] if c["band"] == target["confidence_band"])
    assert band["decided"] >= 1
    assert band["agreed"] >= 1
    assert after["inputs"]["analysed_submissions"] >= before["inputs"]["analysed_submissions"]

    # leave the shared workspace as we found it: other tests assert exact counts
    deleted = client.delete(f"/v1/content/{item_id}", headers=manager)
    assert deleted.status_code in (200, 204), deleted.text
