"""The repository's own honesty rules, as tests (D2 + D3).

Two promises this project makes about itself are checkable, so they are checked here
rather than in a review comment:

* **Every published number comes from a run.** `eval.doc_facts` rebuilds the labelled
  table, the held-out table, the confidence bands and the test count from
  `eval/report.json`, `eval/heldout.json` and pytest's own collection, then looks for the
  exact lines in README/QUICKSTART/docs.
* **The blind set stays blind.** It is scored once by hand; no CI workflow may run it and
  no default path may import it.

If these fail, the fix is to re-run the benchmark and update the document — never to edit
the expected numbers here.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from eval import doc_facts

ROOT = Path(__file__).resolve().parents[2]


# --------------------------------------------------------------------------- #
# D3 — the documents agree with the runs
# --------------------------------------------------------------------------- #
def test_published_numbers_match_the_recorded_runs():
    """README, QUICKSTART and the evaluation doc carry the figures the runs produced."""
    problems, _notes = doc_facts.check()
    assert not problems, "these document claims disagree with eval/report.json or " \
                         "eval/heldout.json:\n  " + "\n  ".join(problems)


def test_the_test_count_in_the_readme_is_the_real_one():
    """`pytest -q`'s count is quoted from collection, not typed by hand."""
    collected = doc_facts.collect_test_count()
    if collected is None:
        pytest.skip("pytest not importable in this environment")
    readme = (ROOT / "README.md").read_text()
    assert f"# {collected} passed" in readme, (
        f"the suite collects {collected} tests but README.md does not say '# {collected} passed'")
    assert f"| Tests | {collected} pytest cases" in readme


def test_the_checker_notices_a_stale_number():
    """A guard that cannot fail is decoration: feed it a document with a wrong figure."""
    facts = doc_facts.facts()
    facts["tests"] = (facts["tests"] or 1) + 1  # claim one more test than exists
    fake_root = ROOT
    problems, _ = doc_facts.check(root=fake_root, f=facts)
    assert problems and any("pytest count" in p or "tests row" in p for p in problems)


def test_the_confidence_band_caveat_is_present_when_the_bands_are_tied():
    """If medium and high are tied, the docs must not claim high is better."""
    facts = doc_facts.facts()
    bands = facts["labelled_bands"]
    if not bands:
        pytest.skip("no labelled confidence bands recorded")
    if bands["low"]["precision"] == bands["high"]["precision"]:
        return  # nothing to distinguish, nothing to claim
    readme = (ROOT / "README.md").read_text()
    if bands["medium"]["precision"] == bands["high"]["precision"]:
        assert "tied" in readme, "medium and high are tied, so 'high is better' must not be implied"


# --------------------------------------------------------------------------- #
# D2 — the blind set stays out of CI and out of every default path
# --------------------------------------------------------------------------- #
def test_blind_set_discipline_holds():
    """CI never runs the blind set; both evaluation CLIs default to the regression set."""
    script = ROOT / "scripts" / "check_heldout_discipline.py"
    assert script.exists(), "the discipline checker must ship with the repo"
    out = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stdout + out.stderr


def test_the_discipline_checker_can_actually_fail(tmp_path):
    """Point it at a fake repo where the blind set is imported eagerly; it must object."""
    module = tmp_path / "scripts"
    module.mkdir()
    script = (ROOT / "scripts" / "check_heldout_discipline.py").read_text()
    # rewrite the root the script resolves, then give it a deliberately broken eval file
    broken = script.replace('ROOT = Path(__file__).resolve().parents[1]',
                            f'ROOT = Path({str(tmp_path)!r})')
    (module / "check.py").write_text(broken)
    (tmp_path / ".github" / "workflows").mkdir(parents=True)
    (tmp_path / ".github" / "workflows" / "ci.yml").write_text(
        "jobs:\n  t:\n    steps:\n      - name: run\n        run: python -m eval.run_llm_eval --samples blind\n")
    (tmp_path / "backend" / "eval").mkdir(parents=True)
    (tmp_path / "backend" / "eval" / "run_eval.py").write_text(
        "from seed.blind_samples import BLIND\n")
    (tmp_path / "backend" / "eval" / "run_llm_eval.py").write_text("import argparse\n")
    out = subprocess.run([sys.executable, str(module / "check.py")], capture_output=True,
                         text=True, timeout=120)
    assert out.returncode == 1, out.stdout
    assert "blind" in out.stdout.lower()


# --------------------------------------------------------------------------- #
# the deploy artefacts named in the brief
# --------------------------------------------------------------------------- #
def test_the_render_demo_blueprint_exists_and_turns_the_demo_on():
    blueprint = (ROOT / "render.demo.yaml").read_text()
    assert "dockerfilePath" in blueprint
    assert "DEMO_MODE" in blueprint and '"1"' in blueprint
    assert "fromDatabase" in blueprint, "the API and the database must be wired together"
    assert "sentinel-demo-db" in blueprint


def test_the_readme_does_not_invent_a_live_url():
    """No deployment exists, so the README must say so instead of printing an address."""
    readme = (ROOT / "README.md").read_text()
    assert "Live URL: not published" in readme, "the deployment state must be stated plainly"
    assert "onrender.com/health" in readme or "onrender.com" in readme, \
        "the deployment instructions must name where the health check lives"
    for invented in ("https://sentinel-demo.onrender.com/health", "sentinel.demo.example"):
        assert invented not in readme


# --------------------------------------------------------------------------- #
# D4 — the docs describe the application that actually exists
# --------------------------------------------------------------------------- #
def _live_endpoints() -> set[str]:
    """Every route the routers declare, with prefixes resolved and ids normalised."""
    import re
    from app.routers import analytics, auth, brand_kit, content, demo, evaluation, guidelines, overrides

    live: set[str] = set()
    for module in (auth, brand_kit, guidelines, content, overrides, analytics, demo, evaluation):
        for route in module.router.routes:
            # FastAPI already folds the router's own prefix into route.path; adding it
            # again produced /auth/auth/login and would have "documented" nothing.
            live.add(re.sub(r"\{[^}]+\}", "{}", route.path))
    return live


def _documented_endpoints() -> set[str]:
    import re

    text = (ROOT / "docs" / "API.md").read_text()
    found: set[str] = set()
    for span in re.findall(r"`(/[^`]+?)`", text):
        found.add(re.sub(r"\{[^}]+\}", "{}", span.split("?")[0]))
    return found


def test_every_endpoint_is_in_the_api_reference():
    """A route nobody documented is a route nobody can use on purpose.

    This exists because the guideline-change queue shipped with four endpoints and no
    API reference entry; the docs were only caught up when somebody read them. Now a new
    route fails the suite until it is written down.
    """
    missing = sorted(_live_endpoints() - _documented_endpoints())
    assert not missing, "these routes exist but are not in docs/API.md:\n  " + "\n  ".join(missing)


def test_every_page_in_the_readme_exists():
    """The README's Pages table is a claim about the app, so it is checked against it."""
    import re

    pages = set()
    for path in (ROOT / "frontend" / "app").rglob("page.tsx"):
        route = str(path.parent.relative_to(ROOT / "frontend" / "app"))
        pages.add("/" if route == "." else f"/{route}")

    readme = (ROOT / "README.md").read_text()
    documented = {m.split("?")[0] for m in re.findall(r"^\| `(/[a-z0-9/\-\[\]]*)`", readme, re.M)}

    # /welcome is a redirect, not a page; every other documented route must exist
    missing = sorted(documented - pages - {"/welcome"})
    assert not missing, "README documents pages that do not exist:\n  " + "\n  ".join(missing)

    undocumented = sorted(pages - documented)
    assert not undocumented, "these pages are not in the README's Pages table:\n  " + "\n  ".join(undocumented)


def test_the_architecture_diagram_is_committed_with_its_source():
    """The diagram in the docs is a real file, in both formats, and it is referenced."""
    svg = ROOT / "docs" / "images" / "architecture.svg"
    png = ROOT / "docs" / "images" / "architecture.png"
    assert svg.exists() and svg.stat().st_size > 5000, "architecture.svg is missing or empty"
    assert png.exists() and png.stat().st_size > 5000, "architecture.png (the fallback) is missing"
    assert "images/architecture.svg" in (ROOT / "docs" / "ARCHITECTURE.md").read_text()
