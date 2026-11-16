"""Workstream C: document versions, guideline diffs, and the rule review queue.

The invariant under test throughout: **a rule is never changed by a diff.** A new
guideline version can only open a task; a person answers it; the answer is audited.
"""
from __future__ import annotations

import io
import time

from app.services.guideline_diff import (
    diff_documents, normalise_title, similarity, split_sections, summarise,
)

POLICY_V1 = """1. Brand Voice

Write plainly and in the active voice. Never use hype or superlatives.

2. Terminology

Say affordable, not cheap. Say use, not utilise.

3. Legal

Guarantees require written proof held on file before publication.
"""

POLICY_V2 = """1. Brand Voice

Write plainly and in the active voice. A little warmth is welcome in social copy.

2. Terminology

Say affordable, not cheap. Say use, not leverage.

3. Legal

Absolute promises of any kind require written proof held on file before publication.

4. Accessibility

Body copy must be at least 14pt, and images need alternative text.
"""


def policies(tag: str) -> tuple[str, str]:
    """A (v1, v2) pair unique to one test.

    Tests share one database, and a proposed rule is only created when its body is
    new. A tag in the prose keeps each test's document and rules its own, so one
    test's decisions cannot answer another test's tasks.
    """
    def stamp(text: str) -> str:
        # Tag every heading: proposals are de-duplicated on rule title, and two tests
        # that both wrote "1. Brand Voice" would leave the second with no proposed rule
        # at all — so there would be nothing to review. The tag stays inside the heading
        # charset the extractor recognises (letters, spaces, hyphen), and the keyword is
        # still in the title so category routing (legal / accessibility) is unchanged.
        for heading in ("Brand Voice", "Terminology", "Legal", "Accessibility"):
            text = text.replace(heading, f"{heading} - {tag}")
        return (text.replace("in the active voice.", f"in the active voice, {tag} edition.")
                .replace("not cheap.", f"not cheap ({tag}).")
                .replace("held on file", f"held on file ({tag})"))

    return stamp(POLICY_V1), stamp(POLICY_V2)


# --------------------------------------------------------------------------- #
# C1 — sectioning
# --------------------------------------------------------------------------- #
def test_numbered_headings_are_parsed():
    sections = split_sections(POLICY_V1)
    assert [s.title for s in sections] == ["Brand Voice", "Terminology", "Legal"]
    assert "Say affordable" in sections[1].body


def test_markdown_headings_are_parsed():
    text = "## Tone of voice\n\nWarm but plain.\n\n## Colour\n\nUse the approved palette.\n"
    sections = split_sections(text)
    assert [s.title for s in sections] == ["Tone of voice", "Colour"]


def test_docx_heading_blocks_are_parsed():
    blocks = [
        {"kind": "heading", "text": "Voice"},
        {"kind": "paragraph", "text": "Plain words, short sentences."},
        {"kind": "heading", "text": "Colour"},
        {"kind": "paragraph", "text": "Approved palette only."},
    ]
    sections = split_sections("\\n\\n".join(b["text"] for b in blocks), blocks)
    assert [s.title for s in sections] == ["Voice", "Colour"]
    assert "Plain words" in sections[0].body


def test_normalise_title_ignores_numbering_case_and_articles():
    assert normalise_title("2.1 The Tone of Voice") == normalise_title("tone of voice")
    assert normalise_title("(3) Legal") == "legal"


def test_a_reflowed_paragraph_is_not_a_change():
    a = "Write plainly.\n\nUse the active voice."
    b = "Write plainly. Use the active voice."
    assert similarity(a, b) > 0.985


# --------------------------------------------------------------------------- #
# C1 — diffing
# --------------------------------------------------------------------------- #
def test_diff_classifies_added_removed_changed_and_unchanged():
    changes = diff_documents(POLICY_V1, POLICY_V2)
    by_title = {c.title: c for c in changes}
    assert by_title["Brand Voice"].status == "changed"
    assert by_title["Legal"].status == "changed"
    assert by_title["Terminology"].status == "changed"     # "utilise" -> "leverage"
    assert by_title["Accessibility"].status == "added"
    assert summarise(changes) == {"added": 1, "removed": 0, "changed": 3, "unchanged": 0}


def test_an_untouched_section_is_unchanged():
    changes = diff_documents(POLICY_V1, POLICY_V1)
    assert all(c.status == "unchanged" for c in changes)
    assert summarise(changes)["unchanged"] == 3


def test_a_removed_section_is_reported_as_removed():
    changes = diff_documents(POLICY_V1, "1. Brand Voice\n\nWrite plainly and in the active voice. Never use hype or superlatives.\n")
    removed = [c for c in changes if c.status == "removed"]
    assert {c.title for c in removed} == {"Terminology", "Legal"}


def test_a_rename_is_suggested_but_not_asserted():
    old = "## Tone\n\nWarm, plain, never shouty. Short sentences only.\n"
    new = "## Voice and tone\n\nWarm, plain, never shouty. Short sentences only.\n"
    changes = diff_documents(old, new)
    added = next(c for c in changes if c.status == "added")
    assert added.similar_to == "Tone"
    assert any("rename" in note for note in added.notes)


# --------------------------------------------------------------------------- #
# C0/C2 — uploads create versions and tasks, and change nothing else
# --------------------------------------------------------------------------- #
def _upload(client, headers, text: str, filename: str = "guideline.txt", kind: str = "guideline",
            replaces: str | None = None):
    data = {"kind": kind}
    if replaces:
        data["replaces_document_id"] = replaces
    return client.post("/v1/documents",
                       files={"file": (filename, io.BytesIO(text.encode()), "text/plain")},
                       data=data, headers=headers)


def _confirm_all(client, headers) -> int:
    """Confirm every proposed rule, so it is live and can be invalidated by a diff.

    Uploads only ever create *proposed* rules, and a proposal is not standing on a
    guideline yet — so the review queue only has something to say once an Admin has
    made a rule live. That ordering is the product's, and the tests respect it.
    """
    kit = client.get("/v1/brand-kits", headers=headers).json()[0]
    proposals = client.get(f"/v1/brand-kits/{kit['id']}/proposals", headers=headers).json()
    ids = [r["id"] for r in proposals["rules"]]
    if not ids:
        return 0
    resp = client.post(f"/v1/brand-kits/{kit['id']}/confirm",
                       json={"ids": ids, "action": "confirm"}, headers=headers)
    assert resp.status_code == 200, resp.text
    return len(ids)


def _make_change(client, headers, tag: str, filename: str | None = None) -> dict:
    """Upload v1, confirm its proposals, then upload v2. Returns the second response."""
    v1, v2 = policies(tag)
    name = filename or f"policy-{tag}.txt"
    first = _upload(client, headers, v1, filename=name)
    assert first.status_code == 201, first.text
    _confirm_all(client, headers)
    second = _upload(client, headers, v2, filename=name)
    assert second.status_code == 201, second.text
    return second.json()


def _active_rules(client, headers) -> list[dict]:
    resp = client.get("/v1/rules", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_reuploading_a_guideline_bumps_the_version_and_records_lineage(client, auth):
    headers = auth("meera@northwind.example")  # brand_manager
    first = _upload(client, headers, POLICY_V1, filename="policy-lineage.txt")
    assert first.status_code == 201, first.text
    assert first.json()["version"] == 1
    assert _confirm_all(client, headers) >= 1, "the synthetic guideline must propose a rule"

    second = _upload(client, headers, POLICY_V2, filename="policy-lineage.txt")
    assert second.status_code == 201, second.text
    body = second.json()
    assert body["version"] == 2
    assert body["replaces_document_id"] == first.json()["id"]
    assert body["change_id"], "an upload that replaces a version must record the diff"
    assert body["review_tasks"] >= 1


def test_an_explicit_replaces_document_id_wins(client, auth):
    headers = auth("meera@northwind.example")
    v1, v2 = policies("explicit")
    first = _upload(client, headers, v1, filename="policy-explicit-a.txt").json()
    second = _upload(client, headers, v2, filename="policy-explicit-b.txt",
                     replaces=first["id"]).json()
    assert second["version"] == 2
    assert second["replaces_document_id"] == first["id"]


def test_the_diff_endpoint_lists_changes_and_their_tasks(client, auth):
    headers = auth("meera@northwind.example")
    _make_change(client, headers, "endpoint", filename="policy-endpoint.txt")

    resp = client.get("/v1/guideline-changes", headers=headers)
    assert resp.status_code == 200, resp.text
    change = next(c for c in resp.json() if c["filename"] == "policy-endpoint.txt")
    assert change["summary"]["added"] == 1
    assert change["summary"]["changed"] >= 1
    assert change["sections"], "the section diff itself is stored for the review page"
    for task in change["tasks"]:
        assert task["status"] == "needs_review"
        assert task["rule_active"] is True, "a rule is never deactivated by a diff"


def test_a_rule_on_a_changed_section_gets_a_task_and_stays_active(client, auth):
    """The core promise of C2: the task exists, and the rule still runs."""
    headers = auth("meera@northwind.example")
    v1, v2 = policies("task")
    _upload(client, headers, v1, filename="policy-task.txt")
    assert _confirm_all(client, headers) >= 1, "the upload must propose at least one rule"
    rules_before = _active_rules(client, headers)

    second = _upload(client, headers, v2, filename="policy-task.txt").json()
    tasks = client.get("/v1/rule-review-tasks", headers=headers).json()
    mine = [t for t in tasks if t["guideline_change_id"] == second["change_id"]]
    assert mine, tasks

    rules_after = _active_rules(client, headers)
    before_ids = {r["id"] for r in rules_before}
    assert before_ids <= {r["id"] for r in rules_after}, "no rule disappeared"
    assert all(r["active"] for r in rules_after), "no rule was deactivated"
    assert any(r["needs_review"] for r in rules_after), "the badge has something to show"


def test_confirming_proposals_then_uploading_a_new_version_creates_reviewable_tasks(client, auth):
    headers = auth("meera@northwind.example")
    v1, v2 = policies("confirm")
    first = _upload(client, headers, v1, filename="policy-confirm.txt").json()
    kit = client.get("/v1/brand-kits", headers=headers).json()[0]
    proposals = client.get(f"/v1/brand-kits/{kit['id']}/proposals", headers=headers).json()
    rule_ids = [r["id"] for r in proposals["rules"]]
    if rule_ids:
        resp = client.post(f"/v1/brand-kits/{kit['id']}/confirm",
                           json={"ids": rule_ids, "approve": True}, headers=headers)
        assert resp.status_code == 200, resp.text

    second = _upload(client, headers, v2, filename="policy-confirm.txt").json()
    assert second["version"] == 2
    assert first["id"] != second["id"]


# --------------------------------------------------------------------------- #
# C1b — a repeated heading is compared with its own counterpart
# --------------------------------------------------------------------------- #
def test_a_repeated_heading_is_compared_with_its_own_section():
    """Two "Tone" sections must not be swapped.

    Keyed on the title alone the second copy could only be compared with the first, so
    the first copy's edit was reported twice and the section that did not move was
    flagged — with the wrong text quoted back at the reviewer.
    """
    v1 = ("1. Tone\n\nWrite plainly (repeat).\n\n"
          "2. Tone\n\nNever use hype (repeat).\n\n"
          "3. Legal\n\nGuarantees need proof (repeat).\n")
    v2 = ("1. Tone\n\nWrite plainly and warmly (repeat).\n\n"
          "2. Tone\n\nNever use hype (repeat).\n\n"
          "3. Legal\n\nGuarantees need proof (repeat).\n")

    changes = diff_documents(v1, v2)
    assert [c.status for c in changes] == ["changed", "unchanged", "unchanged"]
    changed = changes[0]
    assert changed.previous_body.startswith("Write plainly")
    assert changed.body.startswith("Write plainly and warmly")


def test_a_second_copy_of_a_section_can_change_on_its_own():
    v1 = ("1. Tone\n\nWrite plainly (second).\n\n"
          "2. Tone\n\nNever use hype (second).\n")
    v2 = ("1. Tone\n\nWrite plainly (second).\n\n"
          "2. Tone\n\nNever use hype or superlatives (second).\n")

    changes = diff_documents(v1, v2)
    assert [c.status for c in changes] == ["unchanged", "changed"]
    assert changes[1].previous_body.startswith("Never use hype (second)")
    assert changes[1].body.startswith("Never use hype or superlatives")


# --------------------------------------------------------------------------- #
# C0b — which document a new version replaces
# --------------------------------------------------------------------------- #
def test_a_new_version_under_a_new_filename_is_still_the_version_it_replaces(client, auth):
    """`guidelines-4.2.txt` being replaced by `guidelines-5.0.txt` is the normal case.

    Before this, a changed filename meant the upload was filed as version 1 of a brand
    new document, nothing was compared, and no rule was ever flagged for the guideline
    that had just been re-issued.
    """
    headers = auth("meera@northwind.example")
    v1, v2 = policies("renamed")
    first = _upload(client, headers, v1, filename="guidelines-4.2-renamed.txt").json()
    assert first["version"] == 1
    assert _confirm_all(client, headers) >= 1

    second = _upload(client, headers, v2, filename="guidelines-5.0-renamed.txt")
    assert second.status_code == 201, second.text
    body = second.json()
    assert body["replaces_document_id"] == first["id"], "a new version must name the one it replaces"
    assert body["version"] == 2
    assert body["change_id"], "and must be compared section by section"
    assert body["review_tasks"] >= 1

    relation = client.get("/v1/documents", headers=headers).json()
    new_doc = next(d for d in relation if d["id"] == body["id"])
    old_doc = next(d for d in relation if d["id"] == first["id"])
    assert new_doc["replaces_document_id"] == first["id"]
    assert old_doc["superseded_by"] == body["id"]


def test_an_unrelated_document_is_never_treated_as_a_new_version(client, auth):
    """A privacy policy is not a version of the brand guideline, however it is uploaded."""
    headers = auth("meera@northwind.example")
    v1, _ = policies("unrelated")
    guideline = _upload(client, headers, v1, filename="brand-guidelines-unrelated.txt").json()

    other = _upload(client, headers, "1. Retention\n\nKeep invoices for seven years.\n",
                    filename="privacy-policy-unrelated.txt", kind="legal").json()
    assert other["version"] == 1, "an unrelated document starts its own line"
    assert other["replaces_document_id"] is None
    assert other["change_id"] is None

    same_kind = _upload(client, headers, "1. Launch\n\nNever announce before launch.\n",
                        filename="launch-checklist-unrelated.txt").json()
    assert same_kind["replaces_document_id"] is None, (
        "sharing a document type is not sharing a document")
    assert guideline["id"] != same_kind["id"]


def test_the_document_family_ignores_version_markers_but_not_the_subject():
    from app.routers.brand_kit import _same_document

    assert _same_document("guidelines-4.2.pdf", "guidelines-5.0.pdf")
    assert _same_document("Brand Guidelines.pdf", "brand_guidelines_2026.pdf")
    assert _same_document("tone-of-voice-v2.docx", "tone of voice v3.docx")
    assert not _same_document("brand-guidelines.pdf", "privacy-policy.pdf")
    assert not _same_document("brand-guidelines.pdf", "brand-guidelines-addendum.pdf"), (
        "an addendum is filed next to the guideline, it does not replace it")
    assert not _same_document("policy.pdf", "policy-checklist.pdf")
    assert not _same_document("1.txt", "2.txt"), "version-only names carry no subject at all"


# --------------------------------------------------------------------------- #
# C2b — a rule is flagged for as long as its section keeps moving
# --------------------------------------------------------------------------- #
def test_a_rule_from_the_first_version_is_still_flagged_by_the_fourth(client, auth):
    """Lineage, not just the immediately previous document.

    A rule proposed from v1 stands on v1's text forever. When v3 edits that same
    section, the rule has to be flagged even though the *previous* document (v2) never
    touched it — otherwise a guideline that is re-issued twice silently leaves its
    oldest rules unexamined.
    """
    headers = auth("ananya@northwind.example")  # admin
    tag = "lineage"
    v1 = (f"1. Terminology - {tag}\n\n"
          f"Never write utilize in customer copy ({tag}).\n")
    v2 = (f"1. Terminology - {tag}\n\n"
          f"Never write utilize in customer copy ({tag}).\n\n"
          f"2. Legal - {tag}\n\n"
          f"Never promise a guarantee ({tag}).\n")
    v3 = (f"1. Terminology - {tag}\n\n"
          f"Never write utilize or leverage in customer copy ({tag}).\n\n"
          f"2. Legal - {tag}\n\n"
          f"Never promise a guarantee ({tag}).\n")
    name = f"policy-generations-{tag}.txt"

    first = _upload(client, headers, v1, filename=name).json()
    assert _confirm_all(client, headers) >= 1, "the v1 guideline must propose a rule"
    second = _upload(client, headers, v2, filename=name).json()
    third = _upload(client, headers, v3, filename=name).json()
    assert second["version"] == 2 and third["version"] == 3

    rules = client.get("/v1/rules", headers=headers).json()
    terminology = [r for r in rules if (r.get("body") or "").endswith(f"({tag}).")
                   and "utilize" in (r.get("body") or "")]
    assert terminology, "the rule proposed from v1 must exist"
    rule = terminology[0]

    from app.db import session_scope
    from app.models import Rule, RuleVersion
    with session_scope() as db:
        stored = db.query(RuleVersion).filter(RuleVersion.rule_id == rule["id"]).order_by(
            RuleVersion.version.desc()).first()
        assert stored.source_document_id == first["id"], (
            "the proposal records the version it was drawn from")

    tasks = client.get("/v1/rule-review-tasks?status_filter=all", headers=headers).json()
    on_third = [t for t in tasks if t["guideline_change_id"] == third["change_id"]
                and t["rule_id"] == rule["id"]]
    assert on_third, ("a rule drawn from v1 must be flagged when v3 edits that section; "
                      f"change {third['change_id']} opened {len(tasks)} task(s) overall")
    assert on_third[0]["change_status"] == "changed"
    assert on_third[0]["section_title"].endswith(tag)

    # still nothing altered by the diff itself
    after = next(r for r in client.get("/v1/rules", headers=headers).json() if r["id"] == rule["id"])
    assert after["active"] is True
    assert after["body"] == rule["body"]
    assert after["current_version"] == rule["current_version"]


# --------------------------------------------------------------------------- #
# C2 — the three decisions
# --------------------------------------------------------------------------- #
def _open_task(client, headers, change_id: str) -> dict:
    """The open task belonging to *this* change, not to another test's upload."""
    tasks = client.get("/v1/rule-review-tasks", headers=headers).json()
    mine = [t for t in tasks if t["guideline_change_id"] == change_id]
    assert mine, f"expected an open review task on change {change_id}"
    return mine[0]


def test_keep_leaves_the_rule_exactly_as_it_was(client, auth):
    headers = auth("ananya@northwind.example")  # admin
    change = _make_change(client, headers, "keep")
    task = _open_task(client, headers, change["change_id"])
    before = {r["id"]: r for r in _active_rules(client, headers)}

    resp = client.post(f"/v1/rule-review-tasks/{task['id']}/decide",
                       json={"action": "keep", "reason": "Still accurate."}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "kept"

    after = {r["id"]: r for r in _active_rules(client, headers)}
    touched = before[task["rule_id"]]
    assert after[task["rule_id"]]["body"] == touched["body"]
    assert after[task["rule_id"]]["current_version"] == touched["current_version"]
    assert after[task["rule_id"]]["active"] is True
    assert after[task["rule_id"]]["needs_review"] is False


def test_edit_creates_a_new_rule_version_and_keeps_the_old_one(client, auth):
    headers = auth("ananya@northwind.example")
    change = _make_change(client, headers, "edit")
    task = _open_task(client, headers, change["change_id"])
    before = {r["id"]: r for r in _active_rules(client, headers)}[task["rule_id"]]

    resp = client.post(f"/v1/rule-review-tasks/{task['id']}/decide",
                       json={"action": "edit", "body": "Updated rule text for the new guideline.",
                             "reason": "Section 3 changed."}, headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "edited"

    after = {r["id"]: r for r in _active_rules(client, headers)}[task["rule_id"]]
    assert after["current_version"] == before["current_version"] + 1
    assert after["body"] == "Updated rule text for the new guideline."

    versions = client.get(f"/v1/rules/{task['rule_id']}/versions", headers=headers).json()
    assert len(versions) == before["current_version"] + 1
    assert any(v["status"] == "superseded" for v in versions), "history is kept, not overwritten"


def test_retire_deactivates_without_deleting_history(client, auth):
    headers = auth("ananya@northwind.example")
    change = _make_change(client, headers, "retire")
    task = _open_task(client, headers, change["change_id"])

    resp = client.post(f"/v1/rule-review-tasks/{task['id']}/decide",
                       json={"action": "retire", "reason": "The rule no longer applies."},
                       headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "retired"

    versions = client.get(f"/v1/rules/{task['rule_id']}/versions", headers=headers).json()
    assert versions, "retiring never deletes the rule's history"


def test_a_task_can_only_be_answered_once(client, auth):
    headers = auth("ananya@northwind.example")
    change = _make_change(client, headers, "once")
    task = _open_task(client, headers, change["change_id"])
    first = client.post(f"/v1/rule-review-tasks/{task['id']}/decide",
                        json={"action": "keep"}, headers=headers)
    assert first.status_code == 200
    second = client.post(f"/v1/rule-review-tasks/{task['id']}/decide",
                         json={"action": "retire"}, headers=headers)
    assert second.status_code == 409


def test_a_creator_cannot_decide_a_review_task(client, auth):
    admin = auth("ananya@northwind.example")
    change = _make_change(client, admin, "perm")
    task = _open_task(client, admin, change["change_id"])

    resp = client.post(f"/v1/rule-review-tasks/{task['id']}/decide", json={"action": "keep"},
                       headers=auth("rhea@northwind.example"))  # creator
    assert resp.status_code == 403


def test_a_legal_or_accessibility_rule_needs_an_approver(client, auth):
    """A manager may decide ordinary rules; a legal one needs an Approver role."""
    admin = auth("ananya@northwind.example")
    change = _make_change(client, admin, "approver")
    tasks = [t for t in client.get("/v1/rule-review-tasks", headers=admin).json()
             if t["guideline_change_id"] == change["change_id"]]
    gated = [t for t in tasks if t["requires_approver"]]
    assert gated, f"the synthetic guideline proposes a legal rule that needs an Approver: {tasks}"

    # A Brand Manager may answer ordinary rules, but not this one.
    blocked = client.post(f"/v1/rule-review-tasks/{gated[0]['id']}/decide",
                          json={"action": "keep"}, headers=auth("meera@northwind.example"))
    assert blocked.status_code == 403, blocked.text
    assert "Approver" in blocked.json()["detail"]

    # The Approver can, and only then does the rule change.
    allowed = client.post(f"/v1/rule-review-tasks/{gated[0]['id']}/decide",
                          json={"action": "keep"}, headers=auth("arjun@northwind.example"))
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["task"]["status"] == "kept"


def test_every_decision_is_written_to_the_audit_log(client, auth):
    headers = auth("ananya@northwind.example")
    change = _make_change(client, headers, "audit")
    task = _open_task(client, headers, change["change_id"])
    client.post(f"/v1/rule-review-tasks/{task['id']}/decide",
                json={"action": "keep", "reason": "Checked."}, headers=headers)

    log = client.get("/v1/audit?action=rule_review.keep", headers=headers)
    assert log.status_code == 200, log.text
    entries = log.json()
    rows = entries if isinstance(entries, list) else entries.get("entries", [])
    assert any(e.get("entity_id") == task["id"] for e in rows), rows[:3]


def test_the_badge_count_matches_the_open_tasks(client, auth):
    headers = auth("ananya@northwind.example")
    before = client.get("/v1/rule-review-tasks/count", headers=headers).json()["needs_review"]
    _upload(client, headers, POLICY_V1, filename="policy-count.txt")
    _confirm_all(client, headers)
    _upload(client, headers, POLICY_V2, filename="policy-count.txt")
    after = client.get("/v1/rule-review-tasks/count", headers=headers).json()
    assert after["needs_review"] >= before


# --------------------------------------------------------------------------- #
# C4 — the pinned baseline
# --------------------------------------------------------------------------- #
def test_pinning_a_baseline_makes_it_the_comparison_point(client, auth):
    headers = auth("karan@northwind.example")  # manager

    from app.db import session_scope
    from app.models import Organisation, RegressionRun

    with session_scope() as db:
        org = db.query(Organisation).filter(Organisation.slug == "northwind").first()
        run = RegressionRun(org_id=org.id, trigger="test", passed=True,
                            metrics={"candidate": {"overall": {"micro_f1": 0.9}}})
        db.add(run)
        db.flush()
        run_id = run.id

    pinned = client.post("/v1/regression/pin", json={"run_id": run_id}, headers=headers)
    assert pinned.status_code == 200, pinned.text
    baseline = client.get("/v1/regression/baseline", headers=headers).json()
    assert baseline["baseline"]["id"] == run_id
    assert baseline["baseline"]["pinned"] is True

    # pinning a second run unpins the first: there is exactly one baseline
    with session_scope() as db:
        org = db.query(Organisation).filter(Organisation.slug == "northwind").first()
        second = RegressionRun(org_id=org.id, trigger="test", passed=True, metrics={})
        db.add(second)
        db.flush()
        second_id = second.id
    client.post("/v1/regression/pin", json={"run_id": second_id}, headers=headers)
    baseline = client.get("/v1/regression/baseline", headers=headers).json()
    assert baseline["baseline"]["id"] == second_id

    from sqlalchemy import select

    with session_scope() as db:
        pinned_rows = db.execute(select(RegressionRun).where(RegressionRun.pinned.is_(True))
                                 ).scalars().all()
        assert len(pinned_rows) == 1


def test_run_regression_reports_what_it_compared_against(client, auth):
    from app.db import session_scope
    from app.models import Organisation
    from app.services.regression import run_regression
    from seed.samples import SAMPLES

    with session_scope() as db:
        org = db.query(Organisation).filter(Organisation.slug == "northwind").first()
        payload = run_regression(db, org_id=org.id, trigger="test")
        assert payload["threshold"] == 0.05
        assert "compared_with" in payload
        assert payload["samples"] == len(SAMPLES)


# --------------------------------------------------------------------------- #
# C2c — the demo workspace ships a real comparison, not an empty page
# --------------------------------------------------------------------------- #
def test_the_demo_workspace_has_a_guideline_change_to_show(client, auth):
    """A fresh demo must not open on "No guideline changes yet".

    The demo used to ship exactly one guideline version, so the Guideline changes
    page was empty on every new workspace and looked broken. The seed now re-issues
    the guideline through the real pipeline.
    """
    headers = auth("ananya@northwind.example")
    changes = client.get("/v1/guideline-changes", headers=headers).json()
    demo = [c for c in changes if c["filename"].startswith("northwind-brand-guidelines")]
    assert demo, "the seeded workspace must contain at least one recorded comparison"

    change = demo[0]
    assert change["summary"]["changed"] >= 1 and change["summary"]["removed"] >= 1
    assert change["summary"]["added"] >= 1
    assert change["sections"], "the section diff is stored for the review page"
    assert change["tasks"], "the re-issue must flag the rules that stand on the changed sections"

    for task in change["tasks"]:
        assert task["status"] == "needs_review"
        assert task["change_status"] in ("changed", "removed")
        assert task["rule_active"] is True, "a seeded diff must never alter a rule"


def test_the_seeded_comparison_points_at_two_documents(client, auth):
    """v4.2 is superseded by v5.0, and the lineage says so."""
    headers = auth("ananya@northwind.example")
    docs = client.get("/v1/documents", headers=headers).json()
    older = [d for d in docs if d["filename"] == "northwind-brand-guidelines-4.2.md"]
    newer = [d for d in docs if d["filename"] == "northwind-brand-guidelines-5.0.md"]
    assert older and newer, [d["filename"] for d in docs]
    assert newer[0]["version"] == 2
    assert newer[0]["replaces_document_id"] == older[0]["id"]
    assert older[0]["superseded_by"] == newer[0]["id"]


def test_seeding_the_demo_twice_does_not_duplicate_the_comparison(client, auth):
    """The seed runs on every startup; it must be idempotent."""
    from app.db import session_scope
    from app.models import GuidelineChange
    from sqlalchemy import select
    from seed.seed import ensure_demo_guideline_change

    before = client.get("/v1/guideline-changes", headers=auth("ananya@northwind.example")).json()
    assert ensure_demo_guideline_change() is False, "the re-issue already exists"
    with session_scope() as db:
        rows = db.execute(select(GuidelineChange)).scalars().all()
    after = client.get("/v1/guideline-changes", headers=auth("ananya@northwind.example")).json()
    assert len(after) == len(before)
    assert len([r for r in rows if r.filename == "northwind-brand-guidelines-5.0.md"]) == 1
