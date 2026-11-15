"""The evaluation screen must work where `eval/` does not ship — without inventing a number.

A serverless deploy bundles only the files traced from its entry point, so
`eval/report.json` is absent there. The router falls back to a recorded copy baked into
`app/eval_snapshot.py`. These tests pin the two properties that make that acceptable:

1. the numbers served are the recorded run's numbers, byte for byte — never a guess;
2. the response says which source it used and when it was recorded, always, so a bundled
   copy can never be rendered as a live measurement.

They also pin the generated module's importability: `json.dumps` writes `true`/`null`,
which are not Python, and a module that raises on import would put the screen straight
back into "not measured".
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
SNAPSHOT_FILE = BACKEND / "app" / "eval_snapshot.py"


@pytest.fixture()
def snapshot():
    """The generated module, imported fresh so a stale `.pyc` cannot mask a bad file."""
    import importlib

    import app.eval_snapshot as module

    return importlib.reload(module)


def test_snapshot_module_exists_and_imports(snapshot):
    """A generated file that does not import is worse than no file: it fails at page load."""
    assert SNAPSHOT_FILE.exists(), "run `python -m eval.snapshot`"
    assert isinstance(snapshot.REPORT, dict)
    assert isinstance(snapshot.HELDOUT, dict)
    assert snapshot.RECORDED_AT, "the recorded copy must carry its timestamp"


def test_snapshot_is_python_not_json(snapshot):
    """`json.dumps` emits `true`/`false`/`null`; those are a SyntaxError in Python."""
    source = SNAPSHOT_FILE.read_text()
    body = source.split("RECORDED_AT", 1)[-1]
    # Strip string literals before looking, so prose containing the word "true" is fine.
    without_strings = re.sub(r"'[^']*'|\"[^\"]*\"", "''", body)
    for token in ("true", "false", "null"):
        assert not re.search(rf"\b{token}\b", without_strings), f"JSON literal `{token}` leaked into the module"


def test_snapshot_matches_the_recorded_run():
    """CI runs this: a bundled number may not drift from the report it claims to copy."""
    from eval.snapshot import check

    ok, message = check()
    assert ok, message


def test_evaluation_serves_the_file_when_one_exists(client, auth):
    resp = client.get("/v1/evaluation", headers=auth("karan@northwind.example"))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["regression"]["source"] == "eval/report.json"
    assert data["regression"]["recorded_at"], "a live number still needs its timestamp"
    assert data["can_generate"] is False


def test_evaluation_falls_back_to_the_recorded_copy(client, auth, monkeypatch, snapshot):
    """The deployed case: no `eval/` directory, only the bundled copy."""
    from app.routers import evaluation as router

    monkeypatch.setattr(router, "EVAL_DIR", Path("/nonexistent/eval"))

    resp = client.get("/v1/evaluation", headers=auth("karan@northwind.example"))
    assert resp.status_code == 200, resp.text
    data = resp.json()

    block = data["regression"]
    assert block is not None, "the fallback must produce the report, not an empty screen"
    assert "recorded copy" in block["source"]
    assert block["recorded_at"] == snapshot.RECORDED_AT

    # Support numbers are exact values from the recorded run, not placeholders.
    assert block["samples"] == snapshot.REPORT["samples"]
    recorded = snapshot.REPORT["comparison"]["candidate_overall"]
    assert block["overall"]["micro_f1"] == recorded["micro_f1"]
    assert block["overall"]["micro_precision"] == recorded["micro_precision"]

    assert data["heldout"] is not None
    assert "recorded copy" in data["heldout"]["source"]
    assert data["heldout"]["is_heldout"] is True
    assert data["llm_markdown"], "the offline column is tracked and needs no key"


def test_fallback_is_labelled_differently_from_live(client, auth, monkeypatch):
    """The two sources must be distinguishable by the client. Same numbers, different claim."""
    live = client.get("/v1/evaluation", headers=auth("karan@northwind.example")).json()

    from app.routers import evaluation as router

    monkeypatch.setattr(router, "EVAL_DIR", Path("/nonexistent/eval"))
    recorded = client.get("/v1/evaluation", headers=auth("karan@northwind.example")).json()

    assert live["regression"]["source"] != recorded["regression"]["source"]
    assert "snapshot" in recorded["regression"]["source"]
    assert "snapshot" not in live["regression"]["source"]


def test_missing_everything_reports_nothing_rather_than_zero(client, auth, monkeypatch):
    """With neither file nor snapshot the screen says "not measured" — it does not serve 0.0."""
    from app.routers import evaluation as router

    monkeypatch.setattr(router, "EVAL_DIR", Path("/nonexistent/eval"))
    monkeypatch.setattr(router, "_snapshot", lambda: None)

    data = client.get("/v1/evaluation", headers=auth("karan@northwind.example")).json()
    assert data["regression"] is None
    assert data["heldout"] is None
    assert data["llm_markdown"] is None
    assert data["can_generate"] is True
    assert data["looked_for"] == "eval/report.json"


def test_confidence_bands_are_served_so_the_band_can_be_checked(client, auth):
    """The screen shows precision per band; without it the score is unfalsifiable."""
    block = client.get("/v1/evaluation", headers=auth("karan@northwind.example")).json()["regression"]
    bands = block["bands"]
    assert bands, "confidence bands must be served with the report"
    for name in ("low", "medium", "high"):
        assert {"predicted", "matched", "precision"} <= set(bands[name])
        assert 0.0 <= bands[name]["precision"] <= 1.0


def test_report_carries_its_provenance():
    """A number without a provider and a time is a rumour."""
    report = json.loads((BACKEND / "eval" / "report.json").read_text())
    assert report["generated_at"], "run_eval must stamp generated_at"
    assert report["provider"]
    assert report["model"]
    assert report["embedding_mode"]


# ---------------------------------------------------------------- the stale-copy guard


def _payload(f1: float, generated_at: str) -> dict:
    report = json.loads((BACKEND / "eval" / "report.json").read_text())
    report["comparison"]["candidate_overall"]["micro_f1"] = f1
    report["generated_at"] = generated_at
    return {
        "generated_at": generated_at,
        "provider": report["provider"],
        "model": report["model"],
        "report": report,
        "heldout": json.loads((BACKEND / "eval" / "heldout.json").read_text()),
        "llm_markdown": "| x |\n|---|\n| 1 |\n",
    }


def test_check_passes_when_only_the_clock_moved(tmp_path, monkeypatch):
    """CI re-runs the benchmark, so the timestamp always differs there. That must not fail."""
    from eval import snapshot as snap

    payload = _payload(0.98, "2026-11-15T11:34:10+00:00")
    target = tmp_path / "eval_snapshot.py"
    target.write_text(snap.render(payload))

    monkeypatch.setattr(snap, "TARGET", target)
    monkeypatch.setattr(snap, "build", lambda: _payload(0.98, "2030-01-01T00:00:00+00:00"))

    ok, message = snap.check()
    assert ok, message
    assert "2030-01-01" in message, "the check should still report which run is which"


def test_check_fails_when_a_number_moved(tmp_path, monkeypatch):
    """A bundled number that no longer matches the recorded run is exactly what to catch."""
    from eval import snapshot as snap

    target = tmp_path / "eval_snapshot.py"
    target.write_text(snap.render(_payload(0.98, "2026-11-15T11:34:10+00:00")))
    monkeypatch.setattr(snap, "TARGET", target)
    monkeypatch.setattr(snap, "build", lambda: _payload(0.51, "2026-11-15T11:34:10+00:00"))

    ok, message = snap.check()
    assert not ok
    assert "does not" in message or "no longer" in message


def test_check_survives_an_unimportable_generated_file(tmp_path, monkeypatch):
    """Regression on the original bug: a module raising SyntaxError told nobody why."""
    from eval import snapshot as snap

    target = tmp_path / "eval_snapshot.py"
    target.write_text("RECORDED_AT = 'x'\nREPORT = {'a': true}\n")
    monkeypatch.setattr(snap, "TARGET", target)

    ok, message = snap.check()
    assert not ok
    assert "does not import" in message
