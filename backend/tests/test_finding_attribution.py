"""Every finding must cite a rule that actually bears on the issue.

The failure this guards against is subtle but corrosive: a finding whose quoted rule is
merely *some* rule from the same reviewer ("ALL CAPS text" quoting the contrast rule)
reads like a citation while explaining nothing.
"""
from __future__ import annotations

import time

CAPS_ONLY = "DOWNLOAD THE COMPLETE BUYER GUIDE TODAY"
SMALL_TEXT_ONLY = "Set the summary in 12pt so it fits the box."


def _analyse(client, headers, text: str, content_type: str = "social_post") -> list[dict]:
    resp = client.post("/v1/content", headers=headers, json={
        "title": "Attribution probe", "content_type": content_type,
        "department": "Marketing", "text": text,
    })
    assert resp.status_code == 201, resp.text
    item_id = resp.json()["id"]
    run_id = client.post(f"/v1/content/{item_id}/analyze", headers=headers).json()["id"]
    for _ in range(80):
        run = client.get(f"/v1/analysis-runs/{run_id}", headers=headers).json()
        if run["status"] in ("complete", "failed"):
            assert run["status"] == "complete", run
            return run["findings"]
        time.sleep(0.2)
    raise AssertionError("analysis did not finish")


def _by_issue(findings: list[dict], needle: str) -> dict:
    for f in findings:
        if needle.lower() in f["issue"].lower():
            return f
    raise AssertionError(f"no finding matching {needle!r} in {[f['issue'] for f in findings]}")


def test_all_caps_finding_cites_the_caps_rule(client, auth):
    findings = _analyse(client, auth("rhea@northwind.example"), CAPS_ONLY)
    finding = _by_issue(findings, "ALL CAPS")
    quoted = (finding.get("rule_quote") or "").lower()
    assert "capital" in quoted or "caps" in quoted, quoted
    assert "contrast" not in quoted.replace("all capitals", ""), quoted


def test_small_text_finding_cites_the_minimum_size_rule(client, auth):
    findings = _analyse(client, auth("rhea@northwind.example"), SMALL_TEXT_ONLY)
    finding = _by_issue(findings, "Text size")
    quoted = (finding.get("rule_quote") or "").lower()
    assert "14pt" in quoted or "16px" in quoted, quoted


def test_every_finding_that_names_a_rule_quotes_it(client, auth):
    """No finding may claim a rule without showing the text of that rule."""
    findings = _analyse(client, auth("rhea@northwind.example"),
                        "Our cheap plan gives guaranteed results. Set the body in 12pt Inter.")
    assert findings
    for f in findings:
        if f.get("rule_key"):
            assert f.get("rule_quote"), f["issue"]
