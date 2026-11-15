"""One price table, one cost function. Every caller uses this module.

There used to be two copies of the table — `pipeline._PRICES` and
`eval.run_llm_eval.PRICES` — which is how a report and a finding end up quoting
different numbers for the same call. Both now import from here.

How cost is reported
--------------------
* A model in the table: `tokens × published list price`, rounded to 8 dp.
* A model that is **not** in the table (a free model, a local Ollama model, a
  provider that publishes no price): reported as **0.00**, with the exact model
  name and `cost_basis = "unpriced"`. It is never `null`, because a null reads as
  "we forgot to measure" — and every call in this system is either priced by its
  provider or free to make.

`cost_basis` travels with the number, so a reader can tell a measured zero from a
measured price. That is the difference between "this run was free" and "this run
cost us nothing *because the provider charges nothing*".
"""
from __future__ import annotations

# USD per 1M tokens: (prompt, completion). Published list prices only.
PRICES: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "claude-3-5-haiku-latest": (0.80, 4.00),
    "claude-sonnet-4": (3.00, 15.00),
}

PRICED = "published list price"
UNPRICED = "unpriced"            # free / local / no published price -> 0.00 by definition
DETERMINISTIC = "deterministic"  # no model call at all -> 0.00, a fact not a price


def is_priced(model: str | None) -> bool:
    return (model or "") in PRICES


def cost_usd(model: str | None, prompt_tokens: int, completion_tokens: int) -> tuple[float, str]:
    """(cost, basis). Unknown models are 0.00 and say why — never null."""
    table = PRICES.get(model or "")
    if table is None:
        return 0.0, UNPRICED
    prompt = max(0, int(prompt_tokens or 0))
    completion = max(0, int(completion_tokens or 0))
    total = prompt / 1_000_000 * table[0] + completion / 1_000_000 * table[1]
    return round(total, 8), PRICED
