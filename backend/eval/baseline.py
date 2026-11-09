"""Single-prompt baseline for comparison.

This is what most teams ship first: one prompt asking a model to "check this
content against the brand guidelines and list problems". It runs every pattern
in one undifferentiated pass, gets no per-reviewer job description, does not
require a cited rule or evidence chunk, and does not merge duplicates.

We reproduce that behaviour deterministically so the comparison is reproducible
and costs nothing. It is a proxy for a single-prompt LLM, not a claim about any
specific model's output.
"""
from __future__ import annotations

import re

from app.llm.local_engine import COLLOQUIAL, HYPE, PLAIN_ENGLISH, RISKY_LEGAL, SMALL_TEXT_RE

CATEGORY_BY_REVIEWER = {
    "brand_voice": "brand_voice", "terminology": "terminology", "fact_checker": "fact",
    "visual": "visual", "accessibility": "accessibility", "legal": "legal",
}


def predict(text: str, blocks: list[dict] | None = None) -> list[dict]:
    """One pass, no rule gating, no evidence requirement, no duplicate merging."""
    preds: list[dict] = []
    blocks = blocks or []

    for word in HYPE + COLLOQUIAL:
        for m in re.finditer(re.escape(word), text, re.I):
            preds.append({"reviewer": "brand_voice", "start": m.start(), "end": m.end()})
    for bad in PLAIN_ENGLISH:
        for m in re.finditer(r"\b" + re.escape(bad) + r"\b", text, re.I):
            preds.append({"reviewer": "terminology", "start": m.start(), "end": m.end()})
    for phrase in RISKY_LEGAL:
        for m in re.finditer(re.escape(phrase), text, re.I):
            preds.append({"reviewer": "legal", "start": m.start(), "end": m.end()})

    # the baseline fires accessibility findings on any digit+unit mention and any
    # link-ish text: precisely the over-triggering a single prompt tends to show.
    for m in re.finditer(r"\b\d{1,2}\s?(?:pt|px)\b", text, re.I):
        preds.append({"reviewer": "accessibility", "start": m.start(), "end": m.end()})
    for m in re.finditer(r"\b(?:here|more|button|link)\b", text, re.I):
        preds.append({"reviewer": "accessibility", "start": m.start(), "end": m.end()})

    # claims: any sentence with a number is flagged as a fact risk (no fact table lookup)
    for m in re.finditer(r"[^.!?\n]*\d+[^.!?\n]*[.!?]?", text):
        if m.group(0).strip():
            preds.append({"reviewer": "fact_checker", "start": m.start(0) + 1,
                          "end": max(m.start(0) + 2, m.end(0))})

    for block in blocks:
        if block.get("kind") == "image":
            preds.append({"reviewer": "visual", "start": block.get("start", 0),
                          "end": max(block.get("start", 0) + 1, block.get("end", 0))})
    return preds
