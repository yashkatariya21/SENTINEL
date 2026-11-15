"""Bake a recorded benchmark run into the application, so the screen is never empty.

The evaluation screen reads `eval/report.json` from disk. That works locally and in the
Docker image, where `COPY backend/ .` brings `eval/` along. It does **not** work on a
serverless deploy: Vercel bundles only the files traced from `api/index.py`, and a JSON
data file is not traced — so a fresh deployment shows "No report on disk".

Baking the numbers into the application module fixes that without lying about them:

* `python -m eval.snapshot` reads the recorded run and writes `app/eval_snapshot.py`,
  a plain literal with the timestamp of the run that produced it.
* The API prefers a fresh `eval/report.json` when one exists, and falls back to the
  snapshot otherwise, reporting which one it used and when it was recorded. The screen
  prints that, so a bundled snapshot is never mistaken for a live measurement.
* `python -m eval.snapshot --check` fails if the snapshot has drifted from the report
  on disk. CI runs it, so the baked copy cannot quietly go stale.

Nothing here computes or invents a number: every value is copied from `report.json` /
`heldout.json`, which are written by `eval/run_eval.py`.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
TARGET = BACKEND / "app" / "eval_snapshot.py"

HEADER = '''"""A recorded benchmark run, baked into the app so the evaluation screen is never empty.

GENERATED FILE — do not edit. Rebuild it with:

    cd backend && python -m eval.run_eval && python -m eval.snapshot

Source: eval/report.json and eval/heldout.json, written by eval/run_eval.py running the
offline engine. `python -m eval.snapshot --check` fails if this file drifts from them.

This is a *copy of a measurement*, not a measurement. The API prefers a live
eval/report.json when one is on disk, and tells the caller which it used.
"""

'''


def _load(name: str) -> dict | None:
    path = BACKEND / "eval" / name
    if not path.exists():
        return None
    return json.loads(path.read_text())


def build() -> dict:
    report = _load("report.json")
    heldout = _load("heldout.json")
    if report is None:
        raise SystemExit(
            "no eval/report.json to snapshot. Run `python -m seed.seed && python -m eval.run_eval` first."
        )
    return {
        "generated_at": report.get("generated_at"),
        "provider": report.get("provider"),
        "model": report.get("model"),
        "report": report,
        "heldout": heldout,
        "llm_markdown": _read_markdown(),
    }


def _read_markdown() -> str | None:
    path = BACKEND / "eval" / "report_llm.md"
    if not path.exists():
        return None
    # A markdown report is small; cap it so a stray file cannot bloat the module.
    return path.read_text()[:20_000]


def _literal(value) -> str:
    """A value as Python source.

    `json.dumps` is not enough: JSON's `true`/`false`/`null` are not Python, and a file
    that raises SyntaxError on import is exactly the failure this module exists to
    prevent. Round-tripping through `json.dumps(sort_keys=True)` and back gives stable
    key order, then `repr` writes real Python literals.
    """
    if value is None:
        return "None"
    return repr(json.loads(json.dumps(value, sort_keys=True)))


def render(payload: dict) -> str:
    return (HEADER
            + "from __future__ import annotations\n\n"
            + "RECORDED_AT = " + repr(payload.get("generated_at")) + "\n"
            + "PROVIDER = " + repr(payload.get("provider")) + "\n"
            + "MODEL = " + repr(payload.get("model")) + "\n\n"
            + "REPORT = " + _literal(payload["report"]) + "\n\n"
            + "HELDOUT = " + _literal(payload.get("heldout")) + "\n\n"
            + "LLM_MARKDOWN = " + repr(payload.get("llm_markdown")) + "\n")


def write() -> Path:
    payload = build()
    TARGET.write_text(render(payload))
    return TARGET


def _numbers(report: dict | None) -> dict | None:
    """A report with the clocks removed.

    CI re-runs the benchmark, so `generated_at` is *always* newer there than in the
    committed copy. Comparing that field would make the check fail on every build and
    teach everyone to ignore it. The measurements are deterministic on the offline engine,
    so they are what must match; the timestamps are reported, not compared.
    """
    if not isinstance(report, dict):
        return report
    return {k: v for k, v in report.items() if k not in TIMESTAMP_FIELDS}


TIMESTAMP_FIELDS = ("generated_at",)


def check() -> tuple[bool, str]:
    """Has the baked copy drifted from the recorded run?

    Compares measurements only (see `_numbers`) and reads the committed file from disk
    rather than the installed module, so a stale `.pyc` cannot hide a stale number.
    """
    if not TARGET.exists():
        return False, f"{TARGET.name} is missing — run `python -m eval.snapshot`"

    payload = build()

    import importlib.util

    spec = importlib.util.spec_from_file_location("_sentinel_eval_snapshot_check", TARGET)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:  # a generated file that does not import is the worst case
        return False, (f"{TARGET.name} does not import ({type(exc).__name__}: {exc}) — "
                       "regenerate it with `python -m eval.snapshot`")

    problems = []
    if _numbers(module.REPORT) != _numbers(payload["report"]):
        problems.append("the regression report")
    if module.HELDOUT != payload.get("heldout"):
        problems.append("the held-out report")
    if module.LLM_MARKDOWN != payload.get("llm_markdown"):
        problems.append("the LLM markdown column")

    if problems:
        return False, (
            f"{TARGET.name} no longer matches eval/report.json ({', '.join(problems)} differ) — "
            "run `python -m eval.snapshot` after re-running the benchmark")
    return True, (
        f"{TARGET.name} matches the recorded run "
        f"(recorded {module.RECORDED_AT}, report {payload.get('generated_at')})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="verify the snapshot matches eval/report.json instead of writing it")
    args = parser.parse_args()
    if args.check:
        ok, message = check()
        print(message)
        return 0 if ok else 1
    path = write()
    print(f"wrote {path.relative_to(BACKEND)} from eval/report.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
