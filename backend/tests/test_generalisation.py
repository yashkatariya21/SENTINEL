"""Workstream A5: the engine generalises by shape, not by memorised strings.

Every assertion here is about a *mechanism* — normalisation, inflection, a pattern
family — not about a sample sentence. If one of these breaks, the reviewers have
quietly gone back to literal matching and the blind-set numbers no longer mean
anything.
"""
from __future__ import annotations

import pytest

from app.llm.base import ReviewContext
from app.llm.lexicon import GUARANTEE_PATTERNS, SUPERLATIVE_PATTERNS
from app.llm.local_engine import (
    LocalEngine, find_patterns, find_phrase, normalise_for_match, phrase_variants, spans_collide,
)


def _spans(text: str, phrase: str) -> list[str]:
    return [found for _s, _e, found in find_phrase(text, phrase)]


# --------------------------------------------------------------------------- #
# normalisation
# --------------------------------------------------------------------------- #
def test_zero_width_characters_do_not_hide_a_claim():
    # a CMS that inserts U+200B between words must not defeat the reviewer
    text = "the best\u200b in the world\u200b"
    assert _spans(text, "best in the world") == ["best\u200b in the world"]


def test_non_breaking_space_is_a_space():
    text = "second\u00a0to\u00a0none"
    assert _spans(text, "second to none") == ["second\u00a0to\u00a0none"]


def test_offsets_map_back_to_the_original_text():
    text = "Intro\u200btext. Guaranteed results."
    clean, index = normalise_for_match(text)
    start, end, found = find_phrase(text, "guaranteed")[0]
    assert text[start:end] == found
    assert start == text.index("Guaranteed")


# --------------------------------------------------------------------------- #
# inflection
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("word,text", [
    ("guaranteed", "We guarantee it."),
    ("guaranteed", "It guarantees everything."),
    ("risk-free", "risk free for 30 days"),
    ("unrivalled", "unrivaled in Europe"),
    ("no hidden fees", "no hidden fee"),
])
def test_inflections_and_spelling_variants_match(word, text):
    assert _spans(text, word), f"{word!r} should match {text!r}"


def test_phrase_variants_include_the_stem_and_the_hyphen_form():
    variants = phrase_variants("risk-free")
    assert any("risk" in v and "free" in v for v in variants)
    assert any(r"[\s\-]+" in v for v in variants)


def test_a_word_boundary_still_holds():
    # "cheapest" must not be found inside "cheapology"; the lookarounds are the guard
    assert _spans("cheapology", "cheap") == []
    assert _spans("the cheap seats", "cheap") == ["cheap"]


# --------------------------------------------------------------------------- #
# pattern families
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("text", [
    "Nothing on the market comes close.",
    "The greatest planner available.",
    "Second to none for imports.",
    "Our plan is the cheapest way in.",
])
def test_superlative_families_catch_paraphrases(text):
    assert find_patterns(text, SUPERLATIVE_PATTERNS), text


@pytest.mark.parametrize("text", [
    "We promise every deployment will go live within 14 days.",
    "The scheduler never fails.",
    "You get zero downtime.",
    "100% guaranteed uptime",
])
def test_guarantee_families_catch_paraphrases(text):
    assert find_patterns(text, GUARANTEE_PATTERNS), text


def test_multilingual_superlatives_are_covered():
    assert find_patterns("notre offre est la meilleure du marché",
                         ("\\b(?:la|le)\\s+meilleur(?:e)?(?:\\s+du\\s+march[ée]|\\s+sur\\s+le\\s+march[ée])?\\b",))


def test_spans_collide_recognises_a_short_pattern_inside_a_longer_phrase():
    assert spans_collide((0, 8), (4, 16))      # "the best" vs "best company"
    assert not spans_collide((0, 4), (20, 30))


# --------------------------------------------------------------------------- #
# the reviewers use them
# --------------------------------------------------------------------------- #
def _legal_spans(text: str) -> list[str]:
    out = LocalEngine().review("legal", ReviewContext(text=text, content_type="ad"))
    return [f.span_text for f in out.findings]


def test_legal_reviewer_flags_a_zero_width_superlative():
    spans = _legal_spans("Our tool is the best\u200b in the world\u200b, honestly.")
    assert any("best" in s for s in spans)


def test_legal_reviewer_does_not_double_flag_one_phrase():
    spans = _legal_spans("We are the best company in the market.")
    overlapping = [s for s in spans if "best" in s.lower()]
    assert len(overlapping) == 1, spans


def test_brand_voice_flags_price_framing():
    out = LocalEngine().review("brand_voice",
                               ReviewContext(text="Our plan costs less than a team lunch.",
                                             content_type="social_post"))
    assert any("Price-led" in f.issue for f in out.findings)


def test_clean_copy_stays_quiet():
    text = ("Your order ships on Tuesday. The courier will text you a two-hour window, "
            "and you can move it once at no charge.")
    for reviewer in ("legal", "brand_voice", "terminology", "accessibility"):
        found = LocalEngine().review(reviewer, ReviewContext(text=text, content_type="email"))
        assert found.findings == [], (reviewer, [f.span_text for f in found.findings])
