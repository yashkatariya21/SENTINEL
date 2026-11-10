"""Seed the demo workspace: Northwind Analytics.

Run directly:  python -m seed.seed          (creates ./sentinel.db if missing)
It is also called on API startup when SEED_ON_STARTUP=1 and the org is absent.

The seed exercises the real pipeline end-to-end (no shortcut fixtures), so the
demo data has genuine findings, decisions, overrides, a promoted rule version
and a regression run.
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import settings
from app.db import init_db, session_scope
from app.llm.factory import get_adapter
from app.models import (
    AnalysisRun, Approval, Asset, BrandKit, Chunk, Comment, ContentItem, ContentVersion, Decision,
    Document, Fact, Finding, Membership, Organisation, Override, Rule, RuleVersion, Term, User,
)
from app.security import Principal, hash_password
from app.services.extraction import blocks_to_text, extract_pasted
from app.services.pipeline import execute_run, start_run
from app.services.retrieval import chunk_text, ingest_document
from app.services.workflows import (
    add_comment, answer_learning_prompt, decide, decide_on_finding, promote, submit_for_approval,
)
from app.storage import save_bytes
from seed.brand_kit import ASSETS, FACTS, GUIDELINE_TEXT, ORG, RULES, TERMS, USERS
from seed.samples import by_id

log = logging.getLogger("sentinel.seed")

DEMO_ITEMS = [
    # (sample_id, owner email, target status, days ago, reviewer/approver email)
    ("C01", "rhea@northwind.example", "approved", 52, "karan@northwind.example"),
    ("V03", "rhea@northwind.example", "changes_requested", 44, "karan@northwind.example"),
    ("T01", "vikram@northwind.example", "approved", 38, "karan@northwind.example"),
    ("L01", "rhea@northwind.example", "rejected", 33, "arjun@northwind.example"),
    ("F01", "vikram@northwind.example", "approved", 26, "priya@northwind.example"),
    ("A03", "nikhil@northwind.example", "in_review", 19, None),
    ("V01", "rhea@northwind.example", "in_review", 14, None),
    ("S01", "vikram@northwind.example", "changes_requested", 11, "priya@northwind.example"),
    ("C02", "rhea@northwind.example", "approved", 8, "karan@northwind.example"),
    ("T07", "vikram@northwind.example", "in_review", 5, None),
    ("L07", "rhea@northwind.example", "draft", 2, None),
    ("A04", "nikhil@northwind.example", "draft", 1, None),
]

# Longer hand-written pieces so the Review Report has a realistic density of findings.
DEMO_EXTRA = [
    dict(
        title="Q4 demand planning playbook",
        content_type="blog", department="Marketing", owner="rhea@northwind.example",
        status="in_review", days_ago=6, approver=None,
        text=(
            "Planning for Q4 should feel calm, not chaotic. Our revolutionary platform gives every planner a "
            "seamless weekly rhythm.\n\n"
            "Leverage the Northwind Forecast Cloud to utilize your existing ERP export, with no rip-and-replace "
            "project required. Teams that adopt the weekly rhythm save 11 hours per week, according to our own "
            "analysis.\n\n"
            "We guarantee results within one quarter. If your forecast error does not fall, we will work with you at "
            "no cost until it does.\n\n"
            "SET UP IN FOUR SIMPLE STEPS AND START TODAY\n\n"
            "Connect your data. Review the first forecast. Agree the weekly cadence. Click here to book your review "
            "call. Set the summary panel text in 12pt Inter and use #FF00FF for the alert bar. Place the old logo in "
            "the footer.\n\n"
            "Join 3.9 million planners who already plan their quarter with us."
        ),
    ),
    dict(
        title="Q3 accuracy update (email)",
        content_type="email", department="Product", owner="vikram@northwind.example",
        status="changes_requested", days_ago=9, approver="karan@northwind.example",
        text=(
            "Hi Nikhil,\n\n"
            "Your Q3 forecast accuracy came in at 94.2%, up from last quarter. That is industry-leading work, and we "
            "are thrilled!!\n\n"
            "Prior to your next review, utilize the planner view to compare two scenarios side by side. Our support "
            "team responds within 4 hours on business days.\n\n"
            "Book a slot: Learn more.\n\n"
            "Best company for supply-chain forecasting,\nThe Northwind team"
        ),
    ),
    dict(
        title="Warehouse ad (paid social)",
        content_type="ad", department="Sales", owner="nikhil@northwind.example",
        status="in_review", days_ago=3, approver=None,
        text=(
            "Your warehouse deserves better than guesswork. Our cutting-edge engine turns demand signals into a "
            "weekly plan you can defend. Risk-free for the first month, instant approval, no hidden fees. Tap here "
            "to start."
        ),
    ),
    dict(
        title="Forecasting is a habit (blog)",
        content_type="blog", department="Product", owner="vikram@northwind.example",
        status="approved", days_ago=17, approver="priya@northwind.example",
        text=(
            "Forecasting is a habit, not a project. The teams that plan well do four things every week: they look at "
            "the spread, they ask what changed, they write down one decision, and they compare it with the outcome. "
            "Northwind Forecast Cloud supports that habit with a single weekly view. Customers tell us the habit "
            "matters more than the model."
        ),
    ),
]

TERM_RULE_MAP = {
    "cheap": "TERM-001", "utilize": "TERM-001", "utilise": "TERM-001", "leverage": "TERM-001",
    "synergy": "TERM-001", "prior to": "TERM-001", "ForecastCloud": "TERM-002",
    "Northwind Cloud": "TERM-002", "Northwind Forecast Cloud": "TERM-001", "customers": "TERM-001",
}

def seed_if_empty() -> bool:
    init_db()
    with session_scope() as db:
        existing = db.execute(select(Organisation).where(Organisation.slug == ORG["slug"])).scalars().first()
    if existing:
        return False
    build_workspace()
    return True


# --------------------------------------------------------------------------- #
# Reusable pieces. `build_workspace()` (the CLI / startup path) and the
# one-click demo loader (`app/routers/demo.py`) both compose these, so there is
# exactly one implementation of "what the demo contains".
# --------------------------------------------------------------------------- #
def _owner_map(db, org_id: str) -> dict[str, str]:
    return {u.email: u.id for u in db.execute(select(User).where(User.org_id == org_id)).scalars()}


def ensure_workspace() -> str:
    """Create org, users, Brand Kit, guideline document and reference data.

    Idempotent: if the demo organisation already exists it is returned untouched, so
    POST /v1/demo/load can be called repeatedly (and from a cold database) safely.
    """
    with session_scope() as db:
        existing = db.execute(select(Organisation).where(Organisation.slug == ORG["slug"])).scalars().first()
        if existing is not None:
            return existing.id

    log.info("seeding workspace %s", ORG["slug"])
    adapter = get_adapter()
    with session_scope() as db:
        org = Organisation(name=ORG["name"], slug=ORG["slug"], department_list=ORG["departments"],
                           settings={"max_upload_mb": settings.max_upload_mb}, is_demo=True)
        db.add(org)
        db.flush()
        users: dict[str, User] = {}
        demo_password = demo_password_for_seed()
        for email, name, role, dept in USERS:
            user = User(org_id=org.id, email=email, name=name, role=role, department=dept,
                        password_hash=hash_password(demo_password))
            db.add(user)
            db.flush()
            db.add(Membership(org_id=org.id, user_id=user.id, role=role))
            users[email] = user

        kit = BrandKit(org_id=org.id, name="Northwind Brand Kit", version=1, status="active",
                       created_by=users["meera@northwind.example"].id)
        db.add(kit)
        db.flush()

        # ------------------------------------------------------ guideline doc
        guideline_key = save_bytes(GUIDELINE_TEXT.encode(), org_id=org.id, prefix="documents",
                                   filename="northwind-brand-guidelines-4.2.md")
        doc = Document(org_id=org.id, brand_kit_id=kit.id,
                       filename="northwind-brand-guidelines-4.2.md", mime="text/markdown",
                       size_bytes=len(GUIDELINE_TEXT.encode()), kind="guideline", version=1, pages=6,
                       status="extracted", storage_key=guideline_key,
                       meta={"tokens": len(GUIDELINE_TEXT.split()), "source": "hand-written demo kit"})
        db.add(doc)
        db.flush()

        blocks = []
        page = 1
        for line in GUIDELINE_TEXT.splitlines():
            text = line.strip()
            if not text:
                continue
            if text.startswith(("1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.")):
                page = min(6, max(1, int(text.split(".")[0])))
            blocks.append({"id": "", "kind": "heading" if text[:1].isdigit() else "paragraph",
                           "text": text, "page": page, "meta": {}})
        body, blocks = blocks_to_text(blocks)
        page_map = [{"start": b["start"], "end": b["end"], "page": b["page"]} for b in blocks]
        chunks = ingest_document(db, org_id=org.id, document=doc, text=body, page_map=page_map)
        log.info("chunked guideline into %s chunks", len(chunks))

        # ------------------------------------------------------------- rules
        rule_by_key: dict[str, Rule] = {}
        for spec in RULES:
            rule = Rule(org_id=org.id, brand_kit_id=kit.id, key=spec["key"], category=spec["category"],
                        check_type=spec["check_type"], requires_approver=spec["requires_approver"],
                        current_version=1, active=True)
            db.add(rule)
            db.flush()
            db.add(RuleVersion(
                org_id=org.id, rule_id=rule.id, version=1, title=spec["title"], body=spec["body"],
                author_id=users["meera@northwind.example"].id, status="active",
                source_document_id=doc.id, source_page=spec["source_page"],
                source_section=spec["source_section"],
                reason="Confirmed by the Admin from the brand guidelines.",
                embedding=adapter.embed([spec["body"]])[0],
            ))
            rule_by_key[spec["key"]] = rule

        # ------------------------------------------------------------- terms
        for kind, value, replacement, severity, note in TERMS:
            db.add(Term(org_id=org.id, brand_kit_id=kit.id, kind=kind, value=value,
                        replacement=replacement, severity=severity, note=note, status="confirmed",
                        rule_id=rule_by_key.get(TERM_RULE_MAP.get(value, ""), rule_by_key["TERM-001"]).id))

        # ------------------------------------------------------------- facts
        for statement, value, topic, page_no in FACTS:
            db.add(Fact(org_id=org.id, brand_kit_id=kit.id, statement=statement, value=value,
                        topic=topic, source_document_id=doc.id, source_page=page_no,
                        status="confirmed", confirmed_by=users["ananya@northwind.example"].id,
                        confirmed_at=datetime.now(timezone.utc)))

        # ------------------------------------------------------------ assets
        for asset in ASSETS:
            db.add(Asset(org_id=org.id, brand_kit_id=kit.id, kind=asset["kind"], name=asset["name"],
                         value=asset["value"], version=asset.get("version"),
                         status=asset["status"], meta=asset.get("meta") or {}))

        db.flush()
        return org.id


def existing_titles(org_id: str) -> set[str]:
    """Titles already present for the demo organisation (used to stay idempotent)."""
    with session_scope() as db:
        return {t for t in db.execute(
            select(ContentItem.title).where(ContentItem.org_id == org_id)).scalars().all()}


def create_item(org_id: str, *, title: str, content_type: str, department: str | None,
                owner_email: str, body_text: str) -> dict:
    """Create one content item + version + queued analysis run."""
    with session_scope() as db:
        owners = _owner_map(db, org_id)
        extracted = extract_pasted(body_text)
        item = ContentItem(org_id=org_id, title=title, content_type=content_type,
                           department=department, owner_id=owners[owner_email],
                           status="draft", current_version=1, is_demo=True)
        db.add(item)
        db.flush()
        version = ContentVersion(org_id=org_id, content_item_id=item.id, version=1,
                                 body_text=extracted["text"], blocks=extracted["blocks"],
                                 author_id=owners[owner_email])
        db.add(version)
        db.flush()
        run = start_run(db, org_id=org_id, item=item, version=version)
        return {"item_id": item.id, "run_id": run.id, "title": title, "owner": owner_email}


def run_analyses(created: list[dict], *, concurrency: int = 1, on_progress=None) -> list[str]:
    """Run the real pipeline for each queued run, capped at `concurrency` threads.

    `on_progress(done, total)` is called after each run so the demo endpoint can keep a
    live counter for the UI. A single failing run never aborts the batch.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    errors: list[str] = []
    total = len(created)
    done = 0
    if concurrency <= 1:
        for row in created:
            try:
                execute_run(row["run_id"])
            except Exception as exc:  # noqa: BLE001 - recorded, never fatal
                errors.append(f"{row['title']}: {type(exc).__name__}")
            done += 1
            if on_progress:
                on_progress(done, total)
        return errors

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(execute_run, row["run_id"]): row for row in created}
        for future in as_completed(futures):
            row = futures[future]
            try:
                future.result()
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{row['title']}: {type(exc).__name__}")
            done += 1
            if on_progress:
                on_progress(done, total)
    return errors


def _principal_for(email: str) -> Principal:
    with session_scope() as db:
        user = db.execute(select(User).where(User.email == email)).scalars().first()
        return Principal(user_id=user.id, org_id=user.org_id, role=user.role,
                         email=user.email, name=user.name, department=user.department)


def apply_story(org_id: str, created: list[dict]) -> None:
    """Approvals, manager overrides, the learning loop, comments and backdating.

    `created` rows may carry optional keys: target status, approver email, days_ago and
    `sample` (used to pick specific findings for the story). Rows without a status are
    left as drafts.
    """
    rows = [r for r in created if r.get("status")]
    for row in rows:
        if row["status"] == "draft":
            continue
        with session_scope() as db:
            item = db.get(ContentItem, row["item_id"])
            submit_for_approval(db, item, _principal_for(row["owner"]), note="Ready for review.")
        if row["status"] == "in_review":
            continue
        approver = _principal_for(row.get("approver") or "karan@northwind.example")
        with session_scope() as db:
            item = db.get(ContentItem, row["item_id"])
            if row["status"] == "approved":
                decide(db, item, approver, action="approve", reason="Meets the brand standard.")
            elif row["status"] == "changes_requested":
                decide(db, item, approver, action="request_changes",
                       reason="Please fix the flagged issues before we publish.")
            elif row["status"] == "rejected":
                decide(db, item, approver, action="reject",
                       reason="The guarantee claim cannot be substantiated; do not publish.")

    manager_principal = _principal_for("karan@northwind.example")
    legal_approver = _principal_for("arjun@northwind.example")

    def findings_for(sample_id: str, category: str | None = None) -> list[Finding]:
        matches = [r for r in created if r.get("sample") == sample_id]
        if not matches:
            return []
        with session_scope() as db:
            q = select(Finding).join(AnalysisRun, AnalysisRun.id == Finding.analysis_run_id).where(
                AnalysisRun.content_item_id == matches[0]["item_id"])
            if category:
                q = q.where(Finding.category == category)
            return db.execute(q).scalars().all()

    # 1) accept an obvious finding (hype wording on the launch post)
    for finding in findings_for("V01"):
        if finding.category == "brand_voice":
            with session_scope() as db:
                f = db.get(Finding, finding.id)
                decide_on_finding(db, f, manager_principal, action="accept", reason=None,
                                  edited_suggestion=None)
            break

    # 2) manager overrides a terminology suggestion -> learning prompt -> promoted scoped rule
    target = next(iter(findings_for("T01", "terminology")), None)
    if target is not None:
        with session_scope() as db:
            f = db.get(Finding, target.id)
            _decision, override = decide_on_finding(
                db, f, manager_principal, action="dismiss",
                reason="Sales wants to keep 'cheap' in paid social for the price-led campaign.",
                edited_suggestion=None)
            answer_learning_prompt(
                db, override, manager_principal, make_rule=True, scope="content_type",
                department=None, content_type="ad",
                reason="Approved for paid social advertising only, where the audience responds to price framing.")

    # 3) a legal override that needs an Approver, left pending so the demo shows the gate
    legal_findings = findings_for("L01", "legal")
    if legal_findings:
        with session_scope() as db:
            f = db.get(Finding, legal_findings[0].id)
            _decision, override = decide_on_finding(
                db, f, manager_principal, action="dismiss",
                reason="The campaign has legal sign-off on file; the sentence stays.",
                edited_suggestion=None)
            answer_learning_prompt(
                db, override, manager_principal, make_rule=True, scope="department",
                department="Sales", content_type=None,
                reason="Sales-only exception with legal sign-off.")

    # 4) an Approver promotes a different legal override end-to-end
    rank_findings = findings_for("L07", "legal")
    if rank_findings:
        with session_scope() as db:
            f = db.get(Finding, rank_findings[0].id)
            _decision, override = decide_on_finding(
                db, f, manager_principal, action="dismiss",
                reason="Analyst report is on file; the ranking is sourced.",
                edited_suggestion=None)
            answer_learning_prompt(db, override, manager_principal, make_rule=True, scope="global",
                                   department=None, content_type=None,
                                   reason="Third-party ranking on file.")
        with session_scope() as db:
            override = db.get(Override, override.id)
            promote(db, override, legal_approver, note="Analyst report verified on file.")

    # 5) escalate one accessibility finding
    a11y = findings_for("A03", "accessibility")
    if a11y:
        with session_scope() as db:
            f = db.get(Finding, a11y[0].id)
            decide_on_finding(db, f, manager_principal, action="escalate",
                              reason="Needs an accessibility specialist before launch.",
                              edited_suggestion=None)

    # ------------------------------------------------------------ comments
    def _item_for(sample_id: str) -> str | None:
        return next((r["item_id"] for r in created if r.get("sample") == sample_id), None)

    s01 = _item_for("S01")
    if s01:
        with session_scope() as db:
            add_comment(db, db.get(ContentItem, s01), _principal_for("rhea@northwind.example"),
                        body="The pink bar was a placeholder; swapping to navy #0B3D91.")
        with session_scope() as db:
            add_comment(db, db.get(ContentItem, s01), _principal_for("karan@northwind.example"),
                        body="Thanks — re-run the review once the bar is navy so we can approve.",
                        visibility="internal")
    a03 = _item_for("A03")
    if a03:
        with session_scope() as db:
            add_comment(db, db.get(ContentItem, a03), _principal_for("karan@northwind.example"),
                        body="Agency question: which link text do you prefer for the pricing sheet?",
                        visibility="external")

    backdate(created)


def backdate(created: list[dict]) -> None:
    """Spread the demo items across ~8 weeks so the analytics trend has real shape."""
    now = datetime.now(timezone.utc)
    with session_scope() as db:
        for row in created:
            if row.get("days_ago") is None:
                continue
            ts = now - timedelta(days=row["days_ago"])
            item = db.get(ContentItem, row["item_id"])
            if item is None:
                continue
            item.created_at = ts
            item.submitted_at = ts + timedelta(hours=6) if item.submitted_at else None
            for v in db.execute(select(ContentVersion).where(ContentVersion.content_item_id == item.id)).scalars():
                v.created_at = ts
            for run in db.execute(select(AnalysisRun).where(AnalysisRun.content_item_id == item.id)).scalars():
                run.created_at = ts + timedelta(minutes=4)
                run.started_at = ts + timedelta(minutes=4)
                run.finished_at = ts + timedelta(minutes=5)
            for ap in db.execute(select(Approval).where(Approval.content_item_id == item.id)).scalars():
                ap.decided_at = ts + timedelta(days=1, hours=3)
                ap.created_at = ap.decided_at


def build_workspace() -> None:
    """The seeded demo used by the CLI, tests and SEED_ON_STARTUP."""
    org_id = ensure_workspace()
    created: list[dict] = []
    for sample_id, owner_email, target_status, days_ago, approver_email in DEMO_ITEMS:
        sample = by_id(sample_id)
        row = create_item(org_id, title=sample["title"], content_type=sample["content_type"],
                          department=sample["department"], owner_email=owner_email,
                          body_text=sample["text"])
        row.update(status=target_status, days_ago=days_ago, approver=approver_email, sample=sample_id)
        created.append(row)
    for spec in DEMO_EXTRA:
        row = create_item(org_id, title=spec["title"], content_type=spec["content_type"],
                          department=spec["department"], owner_email=spec["owner"],
                          body_text=spec["text"])
        row.update(status=spec["status"], days_ago=spec["days_ago"], approver=spec["approver"],
                   sample="EXTRA-" + spec["title"][:12])
        created.append(row)

    run_analyses(created)
    apply_story(org_id, created)
    log.info("seeded %s content items", len(created))


def demo_specs() -> list[dict]:
    """Everything the one-click demo creates: the 53 labelled samples + showcase pieces.

    One list, used by the demo loader and by anyone refreshing a demo workspace, so the
    two paths can never drift apart.
    """
    from seed.samples import SAMPLES

    owners = ["rhea@northwind.example", "vikram@northwind.example", "nikhil@northwind.example"]
    specs: list[dict] = []
    for index, sample in enumerate(SAMPLES):
        specs.append(dict(title=sample["title"], text=sample["text"],
                          content_type=sample["content_type"], department=sample["department"],
                          owner=owners[index % len(owners)], sample=sample["id"],
                          days_ago=index % 56))
    for spec in DEMO_EXTRA:
        specs.append(dict(title=spec["title"], text=spec["text"], content_type=spec["content_type"],
                          department=spec["department"], owner=spec["owner"],
                          sample="EXTRA-" + spec["title"][:12], days_ago=spec["days_ago"]))
    return specs


STORY_SAMPLES = ("V01", "T01", "L01", "L07", "A03", "S01", "C01", "C02", "F01", "V03", "T07")


def load_demo(on_progress=None, on_phase=None, *, concurrency: int = 4) -> dict:
    """One-click demo: ensure the workspace, create any missing item, analyse, tell the story.

    Idempotent — a second call reuses every existing title, analyses nothing twice and
    creates no duplicates.
    """
    org_id = ensure_workspace()
    have = existing_titles(org_id)
    specs = demo_specs()

    if on_phase:
        on_phase("Reading the Brand Kit")
    created: list[dict] = []
    for spec in specs:
        if spec["title"] in have:
            continue
        row = create_item(org_id, title=spec["title"], content_type=spec["content_type"],
                          department=spec["department"], owner_email=spec["owner"],
                          body_text=spec["text"])
        row.update(sample=spec["sample"], days_ago=spec["days_ago"], owner=spec["owner"],
                   status="draft", approver=None)
        created.append(row)
        have.add(spec["title"])

    if on_phase:
        on_phase("Six reviewers are reading")
    errors: list[str] = []
    if created:
        errors = run_analyses(created, concurrency=concurrency, on_progress=on_progress)

    with session_scope() as db:
        already_storied = db.execute(select(Approval).where(Approval.org_id == org_id)).scalars().first()
    if already_storied is None:
        if on_phase:
            on_phase("Signing the approvals and the learning loop")
        rows = all_rows_for_org(org_id)
        story = [r for r in rows if r.get("sample") in STORY_SAMPLES]
        if story:
            apply_story(org_id, story)

    backdate(all_rows_for_org(org_id))
    with session_scope() as db:
        total = db.execute(select(ContentItem).where(ContentItem.org_id == org_id)).scalars().all()
    return {"org_id": org_id, "created": len(created), "total": len(total), "errors": errors}


def story_targets() -> dict[str, tuple[str, str | None, int | None]]:
    """Story key -> (target status, approver email, days ago).

    The workflow story (who submitted what, who approved it, what was rejected) lives in
    `DEMO_ITEMS` and `DEMO_EXTRA`. Nothing else may invent it: if a reload reads `status:
    None` for every row, `apply_story` silently skips everything and the demo comes back
    as 57 drafts with an empty approval queue.
    """
    targets: dict[str, tuple[str, str | None, int | None]] = {}
    for sample_id, _owner, target_status, days_ago, approver in DEMO_ITEMS:
        targets[sample_id] = (target_status, approver, days_ago)
    for spec in DEMO_EXTRA:
        targets[_extra_key(str(spec["title"]))] = (spec["status"], spec["approver"],
                                                   spec["days_ago"])
    return targets


def _extra_key(title: str) -> str:
    return "EXTRA-" + title[:12]


def _story_key_for_title(title: str) -> str | None:
    sample_id = _sample_id_for_title(title)
    if sample_id and sample_id in story_targets():
        return sample_id
    key = _extra_key(title)
    return key if key in story_targets() else None


def all_rows_for_org(org_id: str) -> list[dict]:
    """Every demo content item, shaped like the `created` rows used by apply_story.

    Carries the story targets so a reload (after "Reset demo", or on a database that was
    never seeded) can rebuild the approvals instead of leaving every item a draft.
    """
    targets = story_targets()
    with session_scope() as db:
        items = db.execute(select(ContentItem).where(ContentItem.org_id == org_id)
                           .order_by(ContentItem.created_at)).scalars().all()
        owners = {u.id: u.email for u in db.execute(select(User).where(User.org_id == org_id)).scalars()}
        rows = []
        for item in items:
            key = _story_key_for_title(item.title)
            status, approver, days_ago = targets.get(key, (None, None, None))
            rows.append({"item_id": item.id, "title": item.title, "owner": owners.get(item.owner_id),
                         "status": status, "days_ago": days_ago, "approver": approver,
                         "sample": key})
        return rows


def _sample_id_for_title(title: str) -> str | None:
    from seed.samples import SAMPLES
    for sample in SAMPLES:
        if sample["title"] == title:
            return sample["id"]
    return None


def demo_password_for_seed() -> str:
    """The password given to seeded demo users.

    There is no hard-coded default. `SEED_PASSWORD` must be set explicitly for a
    demo workspace; if it is missing we generate a random one and print it exactly
    once, so a deployment can never end up with credentials that are in the
    repository.
    """
    configured = (settings.seed_password or "").strip()
    if configured:
        return configured
    generated = secrets.token_urlsafe(12)
    log.warning(
        "SEED_PASSWORD was not set. Generated a one-off demo password: %s "
        "(set SEED_PASSWORD to choose your own; it is never written to the repository).",
        generated,
    )
    return generated


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    if os.path.exists("sentinel.db") and os.getenv("SEED_FRESH", "1") == "1":
        os.remove("sentinel.db")
        for ext in ("-wal", "-shm"):
            if os.path.exists("sentinel.db" + ext):
                os.remove("sentinel.db" + ext)
    init_db()
    build_workspace()
    print("Seed complete. Demo users: karan@northwind.example (manager), "
          "ananya@northwind.example (admin). Password = SEED_PASSWORD "
          "(generated and printed once above if you did not set it).")
