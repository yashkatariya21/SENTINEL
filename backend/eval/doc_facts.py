"""Keep the numbers in the docs equal to the numbers in the runs (D3).

Every figure the README and `docs/` publish is derived here, from two sources that are
produced by actual executions:

* `eval/report.json`       — the labelled-set benchmark (`python -m eval.run_eval`)
* `eval/heldout.json`      — the held-out adversarial set, same run
* `pytest --collect-only`  — the number of tests that exist, right now

Nothing in this module is a constant someone typed. The needle strings are *built* from
the measured values, and the check is "does the document contain this exact line". A doc
that drifts from a run therefore fails, and it fails in CI rather than in a review.

Deliberately not automated: prose. The checker verifies numbers and the sentences that
carry them; it cannot tell whether a paragraph still makes sense.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

REVIEWERS = ("brand_voice", "terminology", "fact_checker", "visual", "accessibility", "legal")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def backend_dir() -> Path:
    return Path(__file__).resolve().parents[1]


# --------------------------------------------------------------------------- #
# facts, measured
# --------------------------------------------------------------------------- #
def collect_test_count(*, backend: Path | None = None) -> int | None:
    """The number of tests that exist, from pytest's own collection.

    `--collect-only` imports the suite but runs nothing, so this is cheap and safe. When
    pytest is not importable (docs built in a bare container) the caller gets None and
    the test count is reported as unverified rather than silently passing.
    """
    backend = backend or backend_dir()
    try:
        out = subprocess.run(
            [sys.executable, "-m", "pytest", "--collect-only", "-q", "-p", "no:cacheprovider"],
            cwd=str(backend), capture_output=True, text=True, timeout=300,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    match = re.search(r"(\d+)\s+tests?\s+collected", out.stdout or "")
    return int(match.group(1)) if match else None


def load_eval(backend: Path | None = None) -> dict:
    backend = backend or backend_dir()
    paths = {name: backend / "eval" / name for name in ("report.json", "heldout.json")}
    missing = [str(p) for p in paths.values() if not p.exists()]
    if missing:
        raise FileNotFoundError(
            "no recorded run to check the docs against: " + ", ".join(missing) +
            "\nRun `python -m seed.seed && python -m eval.run_eval` first (the offline engine, "
            "about 10 seconds), then re-run this check.")
    return {"labelled": json.loads(paths["report.json"].read_text()),
            "heldout": json.loads(paths["heldout.json"].read_text())}


def facts(*, backend: Path | None = None, tests: int | None = None) -> dict:
    """Everything the docs are allowed to claim, computed."""
    data = load_eval(backend)
    labelled = data["labelled"]["candidate"]
    baseline = data["labelled"]["baseline"]
    heldout = data["heldout"]

    rows = []
    for name in REVIEWERS:
        c = labelled["per_reviewer"][name]
        b = baseline["per_reviewer"][name]
        rows.append({
            "reviewer": name,
            "precision": c["precision"], "recall": c["recall"], "f1": c["f1"],
            "fp_rate": c["false_positive_rate"],
            "base_precision": b["precision"], "base_recall": b["recall"], "base_f1": b["f1"],
            "delta_f1": round(c["f1"] - b["f1"], 2),
        })
    overall = labelled["overall"]
    base_overall = baseline["overall"]
    strict = heldout["candidate"]["overall"]
    relaxed = heldout["relaxed"]
    bands = heldout.get("confidence_bands") or {}

    return {
        "tests": tests if tests is not None else collect_test_count(backend=backend),
        "labelled_samples": overall["samples"],
        "rows": rows,
        "micro": {"p": overall["micro_precision"], "r": overall["micro_recall"],
                  "f1": overall["micro_f1"], "fp": overall["mean_false_positive_rate"]},
        "baseline": {"p": base_overall["micro_precision"], "r": base_overall["micro_recall"],
                     "f1": base_overall["micro_f1"]},
        "strict": {"p": strict["micro_precision"], "r": strict["micro_recall"],
                   "f1": strict["micro_f1"], "fp": strict["mean_false_positive_rate"]},
        "relaxed": {"p": relaxed["precision"], "r": relaxed["recall"], "f1": relaxed["f1"]},
        "heldout_samples": strict["samples"],
        "bands": bands,
        "labelled_bands": data["labelled"].get("confidence_bands") or {},
    }


# --------------------------------------------------------------------------- #
# what the documents must therefore say
# --------------------------------------------------------------------------- #
def f2(value: float) -> str:
    return f"{value:.2f}"


def expected_needles(f: dict) -> list[tuple[str, str, str]]:
    """(document, exact substring, what it is) — built from the measured facts."""
    out: list[tuple[str, str, str]] = []

    if f["tests"]:
        out.append(("README.md", f"# {f['tests']} passed", "README: pytest count in §8"))
        out.append(("README.md", f"| Tests | {f['tests']} pytest cases", "README: tests row"))
        out.append(("QUICKSTART.md", f"# {f['tests']} passed", "QUICKSTART: pytest count"))
        out.append(("docs/EVALUATION.md", f"(that is {f['tests']} tests)", "EVALUATION: test count"))

    # the per-reviewer table (README §8 and docs/EVALUATION.md share the shape)
    for row in f["rows"]:
        line = (f"| {row['reviewer']} | {f2(row['precision'])} | {f2(row['recall'])} | "
                f"{f2(row['f1'])} | {f2(row['fp_rate'])} | {f2(row['base_precision'])} | "
                f"{f2(row['base_recall'])} | {f2(row['base_f1'])} | {row['delta_f1']:+.2f} |")
        out.append(("README.md", line, f"README: labelled row {row['reviewer']}"))
        out.append(("docs/EVALUATION.md", line, f"EVALUATION: labelled row {row['reviewer']}"))

    micro = (f"| **micro** | **{f2(f['micro']['p'])}** | **{f2(f['micro']['r'])}** | "
             f"**{f2(f['micro']['f1'])}** | **{f2(f['micro']['fp'])}** | "
             f"{f2(f['baseline']['p'])} | {f2(f['baseline']['r'])} | {f2(f['baseline']['f1'])}")
    out.append(("README.md", micro, "README: micro row"))
    out.append(("docs/EVALUATION.md", micro, "EVALUATION: micro row"))

    # held-out
    strict = (f"| strict (correct reviewer *and* span) | {f2(f['strict']['p'])} | "
              f"{f2(f['strict']['r'])} | {f2(f['strict']['f1'])} |")
    relaxed = (f"| relaxed (any reviewer covering the span) | {f2(f['relaxed']['p'])} | "
               f"{f2(f['relaxed']['r'])} | {f2(f['relaxed']['f1'])} |")
    out.append(("README.md", strict, "README: held-out strict row"))
    out.append(("README.md", relaxed, "README: held-out relaxed row"))
    out.append(("docs/EVALUATION.md",
                f"| strict — correct reviewer *and* span overlap | **{f2(f['strict']['p'])}** | "
                f"**{f2(f['strict']['r'])}** | **{f2(f['strict']['f1'])}** |",
                "EVALUATION: held-out strict row"))
    out.append(("docs/EVALUATION.md",
                f"| relaxed — any reviewer covering the labelled span | {f2(f['relaxed']['p'])} | "
                f"{f2(f['relaxed']['r'])} | {f2(f['relaxed']['f1'])} |",
                "EVALUATION: held-out relaxed row"))

    # confidence bands: the honest sentence depends on whether the bands actually rise
    lb = f["labelled_bands"]
    if lb.get("low") and lb.get("medium") and lb.get("high"):
        out.append(("README.md",
                    f"| Precision (matched / predicted) | "
                    f"{f2(lb['low']['precision'])} ({lb['low']['matched']}/{lb['low']['predicted']}) | "
                    f"{f2(lb['medium']['precision'])} ({lb['medium']['matched']}/{lb['medium']['predicted']}) | "
                    f"{f2(lb['high']['precision'])} ({lb['high']['matched']}/{lb['high']['predicted']}) |",
                    "README: confidence-band row"))
    return out


# --------------------------------------------------------------------------- #
def check(*, root: Path | None = None, f: dict | None = None) -> tuple[list[str], list[str]]:
    """Returns (problems, notes). A problem is a doc line that disagrees with a run."""
    root = root or repo_root()
    facts_ = f or facts(backend=backend_dir())
    needles = expected_needles(facts_)
    problems, notes = [], []
    cache: dict[str, str] = {}
    for path, needle, what in needles:
        if path not in cache:
            try:
                cache[path] = (root / path).read_text()
            except FileNotFoundError:
                problems.append(f"{path}: missing (expected for {what})")
                cache[path] = ""
        if needle not in cache[path]:
            problems.append(f"{path}: {what} — no line matching\n      {needle}")
    if facts_["tests"] is None:
        notes.append("test count not verified: pytest could not be imported here")
    if not facts_["labelled_bands"]:
        notes.append("no labelled confidence bands in report.json; that row is not checked")
    return problems, notes


def main() -> int:
    problems, notes = check()
    for note in notes:
        print(f"note: {note}")
    if problems:
        print(f"\n{len(problems)} document claim(s) disagree with the measured runs:\n")
        for problem in problems:
            print(f"  - {problem}")
        print("\nFix the document, or re-run `python -m eval.run_eval` if the code changed.")
        return 1
    print("docs match the runs: test count, labelled table, held-out table, confidence bands.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
