"""Unit tests for the deterministic checks (no model involved)."""
from __future__ import annotations

import pytest

from app.services import deterministic as det

PALETTE = ["#0B3D91", "#F2A900", "#1A1A1A", "#FFFFFF"]


# --------------------------------------------------------------------------- #
# contrast maths
# --------------------------------------------------------------------------- #
def test_contrast_black_on_white_is_21():
    assert det.contrast_ratio("#000000", "#FFFFFF") == 21.0


def test_contrast_is_symmetric_and_short_hex_works():
    assert det.contrast_ratio("#fff", "#000") == det.contrast_ratio("#000000", "#FFFFFF") == 21.0
    assert det.contrast_ratio("#0B3D91", "#FFFFFF") == det.contrast_ratio("#FFFFFF", "#0B3D91")


def test_contrast_amber_on_white_fails_aa():
    ratio = det.contrast_ratio("#F2A900", "#FFFFFF")
    assert ratio < 4.5
    ok, verdict = det.wcag_verdict(ratio)
    assert ok is False
    assert "fails WCAG AA" in verdict


def test_contrast_navy_on_white_passes():
    ok, _ = det.wcag_verdict(det.contrast_ratio("#0B3D91", "#FFFFFF"))
    assert ok is True


def test_large_text_threshold_is_three():
    assert det.wcag_verdict(3.2, large_text=True)[0] is True
    assert det.wcag_verdict(3.2, large_text=False)[0] is False


def test_invalid_hex_raises():
    with pytest.raises(ValueError):
        det.hex_to_rgb("#12")


# --------------------------------------------------------------------------- #
# banned / approved terms
# --------------------------------------------------------------------------- #
TERMS = [
    {"kind": "banned", "value": "cheap", "replacement": "affordable", "severity": "medium",
     "status": "confirmed", "rule_key": "TERM-001"},
    {"kind": "banned", "value": "leverage", "replacement": "use", "severity": "low",
     "status": "confirmed", "rule_key": "TERM-001"},
    {"kind": "approved", "value": "customers", "replacement": None, "severity": "low",
     "status": "confirmed", "rule_key": "TERM-001"},
]


def test_banned_term_is_found_with_offsets_and_rule():
    text = "Our cheap plan is here."
    findings = det.check_terms(text, TERMS)
    assert len(findings) == 1
    f = findings[0]
    assert text[f["span_start"]:f["span_end"]] == "cheap"
    assert f["rule_key"] == "TERM-001"
    assert f["deterministic"] is True
    assert "affordable" in (f["suggestion"] or "")
    assert f["severity"] == "medium"


def test_banned_term_respects_word_boundaries():
    # "cheaper" / "cheapest" must not be reported as the banned word "cheap"
    assert det.check_terms("A cheaper and cheapest option.", TERMS) == []
    # ...but hyphenated or punctuated forms are still word-bounded
    assert det.check_terms('It is "cheap".', TERMS)[0]["span_text"] == "cheap"


def test_banned_term_is_case_insensitive():
    findings = det.check_terms("Leverage the data.", TERMS)
    assert findings and findings[0]["span_text"] == "Leverage"


def test_unconfirmed_terms_are_ignored():
    terms = [dict(TERMS[0], status="proposed")]
    assert det.check_terms("Our cheap plan.", terms) == []


def test_each_occurrence_is_reported():
    findings = det.check_terms("cheap today, cheap tomorrow", TERMS)
    assert len(findings) == 2
    assert [f["span_start"] for f in findings] == sorted(f["span_start"] for f in findings)


def test_duplicate_spans_keep_the_more_severe_finding():
    findings = [
        {"span_start": 4, "span_end": 9, "severity": "low", "issue": "a"},
        {"span_start": 4, "span_end": 9, "severity": "high", "issue": "b"},
    ]
    out = det.dedupe_terms(findings)
    assert len(out) == 1 and out[0]["severity"] == "high"


# --------------------------------------------------------------------------- #
# colours / alt text / image quality
# --------------------------------------------------------------------------- #
def test_off_palette_colour_flagged_on_palette_ignored():
    assert det.check_colours("Use #0B3D91 here.", PALETTE) == []
    findings = det.check_colours("Use #FF00FF here.", PALETTE)
    assert len(findings) == 1
    assert findings[0]["span_text"].lower() == "#ff00ff"


def test_colour_check_without_palette_is_a_noop():
    assert det.check_colours("Use #123456.", []) == []


def test_missing_alt_text_is_flagged_but_decorative_is_not():
    blocks = [
        {"kind": "image", "start": 0, "end": 5, "text": "img1", "meta": {"width": 1200, "alt": None}},
        {"kind": "image", "start": 6, "end": 11, "text": "img2", "meta": {"width": 1200, "alt": ""}},
        {"kind": "image", "start": 12, "end": 17, "text": "img3", "meta": {"width": 1200, "alt": "A planner reviewing a forecast"}},
        {"kind": "paragraph", "start": 18, "end": 30, "text": "text", "meta": {}},
    ]
    findings = det.check_alt_text(blocks)
    assert len(findings) == 2
    assert all(f["severity"] == "high" for f in findings)


def test_low_resolution_image_is_flagged():
    blocks = [{"kind": "image", "start": 0, "end": 4, "text": "img", "meta": {"width": 320, "height": 200}}]
    findings = det.check_image_quality(blocks)
    assert findings and "320" in findings[0]["issue"]


def test_high_resolution_image_passes_quality():
    blocks = [{"kind": "image", "start": 0, "end": 4, "text": "img", "meta": {"width": 1600, "height": 900}}]
    assert det.check_image_quality(blocks) == []


def test_declared_colour_pair_failing_contrast_is_flagged():
    text = "Set text #F2A900 on #FFFFFF for the banner."
    findings = det.check_contrast(text)
    assert findings and findings[0]["severity"] == "high"
    assert "4.5:1" in findings[0]["why"]


def test_declared_colour_pair_passing_contrast_is_not_flagged():
    text = "Set text #0B3D91 on #FFFFFF for the banner."
    assert det.check_contrast(text) == []


def test_kit_contrast_pairs_are_checked_when_supplied():
    findings = det.check_contrast("", pairs=[("#F2A900", "#FFFFFF")])
    assert len(findings) == 1


# --------------------------------------------------------------------------- #
# full run
# --------------------------------------------------------------------------- #
def test_run_all_collects_every_check():
    blocks = [{"kind": "image", "start": 0, "end": 3, "text": "img", "meta": {"width": 100, "alt": None}}]
    kit = {"terms": TERMS, "palette": PALETTE, "contrast_pairs": []}
    findings = det.run_all("Our cheap plan uses #FF00FF.", blocks, kit)
    categories = {f["category"] for f in findings}
    assert {"terminology", "visual", "accessibility"} <= categories
    assert all(f["deterministic"] for f in findings)
    assert all(f["rule_key"] for f in findings)
