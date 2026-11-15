#!/usr/bin/env python3
"""Guard the blind set's discipline (D2).

The 25 blind samples in `backend/seed/blind_samples.py` were written after the engine
changes and scored exactly once. That only means anything if the set stays untouched by
CI and by every default path — so this script checks, mechanically, that:

1. no CI workflow executes a blind run (a mention inside a comment is fine; a `run:` line
   is not), and
2. `seed.blind_samples` is only imported inside a branch guarded by
   `samples == "blind"` — never on an import path a normal run walks, and
3. both evaluation CLIs still default to the regression set.

It reads the code with `ast` rather than grepping strings, so a rename or a reflow does not
produce a false pass. Exits non-zero with a specific reason.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"
EVAL_FILES = (ROOT / "backend" / "eval" / "run_eval.py",
              ROOT / "backend" / "eval" / "run_llm_eval.py")
BLIND_MODULE = "seed.blind_samples"


def check_workflows() -> list[str]:
    problems: list[str] = []
    if not WORKFLOWS.is_dir():
        return [f"no workflow directory at {WORKFLOWS}"]
    for path in sorted(WORKFLOWS.glob("*.y*ml")):
        in_run_block = False
        for number, line in enumerate(path.read_text().splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if stripped.startswith("run:") or "- run:" in stripped:
                in_run_block = True
            elif not line.startswith(" " * 8) and stripped and not stripped.startswith("#"):
                # a new key at shallower indentation ends the run block
                in_run_block = stripped.startswith("run:") or "- run:" in stripped
            if "blind" in stripped.lower() and in_run_block:
                problems.append(f"{path.name}:{number} runs something mentioning the blind set: "
                                f"{stripped[:100]}")
    return problems


def _guarded_by_blind(test: ast.expr | None) -> bool:
    if test is None:
        return False
    for node in ast.walk(test):
        if isinstance(node, ast.Compare):
            for comparator in node.comparators:
                if isinstance(comparator, ast.Constant) and comparator.value == "blind":
                    return True
        if isinstance(node, ast.BoolOp):
            if any(isinstance(v, ast.Constant) and v.value == "blind" for v in node.values):
                return True
    return False


def check_imports() -> list[str]:
    problems: list[str] = []
    for path in EVAL_FILES:
        if not path.exists():
            problems.append(f"{path.name}: missing")
            continue
        tree = ast.parse(path.read_text(), filename=str(path))
        guarded_ids: set[int] = set()

        def visit(node: ast.AST, guarded: bool) -> None:
            for child in ast.iter_child_nodes(node):
                this_guarded = guarded
                if isinstance(child, ast.If):
                    this_guarded = guarded or _guarded_by_blind(child.test)
                if isinstance(child, ast.ImportFrom) and (child.module or "").startswith(BLIND_MODULE):
                    if not this_guarded:
                        problems.append(f"{path.name}:{child.lineno} imports {BLIND_MODULE} "
                                        "outside a `samples == \"blind\"` branch")
                    else:
                        guarded_ids.add(id(child))
                visit(child, this_guarded)

        visit(tree, False)

        # the CLI must still default to the regression set
        defaults = [n for n in ast.walk(tree)
                    if isinstance(n, ast.Call)
                    and isinstance(n.func, ast.Attribute) and n.func.attr == "add_argument"
                    and n.args and isinstance(n.args[0], ast.Constant)
                    and n.args[0].value == "--samples"]
        if not defaults:
            problems.append(f"{path.name}: no --samples argument found")
            continue
        default_values = []
        for call in defaults:
            for kw in call.keywords:
                if kw.arg == "default" and isinstance(kw.value, ast.Constant):
                    default_values.append(kw.value.value)
        if default_values != ["regression"]:
            problems.append(f"{path.name}: --samples defaults to {default_values}, expected ['regression']")
    return problems


def main() -> int:
    problems = check_workflows() + check_imports()
    if problems:
        print("blind-set discipline broken:\n")
        for problem in problems:
            print(f"  - {problem}")
        print("\nThe blind set is scored once, by hand, for the final report. Keep it that way.")
        return 1
    print("blind-set discipline intact: CI never runs it, both CLIs default to the regression set,")
    print("and the samples are only imported inside a `samples == \"blind\"` branch.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
