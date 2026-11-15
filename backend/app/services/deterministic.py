"""Deterministic checks — run BEFORE any model call.

These produce Confirmed findings tied to a rule ID, they never depend on an LLM,
and they are the backbone of the confidence score. Every check is unit-tested.
"""
from __future__ import annotations

import re

# --------------------------------------------------------------------------- #
# WCAG 2.1 relative luminance / contrast ratio
# --------------------------------------------------------------------------- #
def _srgb(channel: float) -> float:
    return channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    v = value.strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) != 6:
        raise ValueError(f"not a hex colour: {value!r}")
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def relative_luminance(hex_colour: str) -> float:
    r, g, b = (c / 255 for c in hex_to_rgb(hex_colour))
    return 0.2126 * _srgb(r) + 0.7152 * _srgb(g) + 0.0722 * _srgb(b)


def contrast_ratio(fg: str, bg: str) -> float:
    l1, l2 = relative_luminance(fg), relative_luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return round((hi + 0.05) / (lo + 0.05), 2)


def wcag_verdict(ratio: float, large_text: bool = False) -> tuple[bool, str]:
    threshold = 3.0 if large_text else 4.5
    aa = ratio >= threshold
    aaa = ratio >= (4.5 if large_text else 7.0)
    if aaa:
        return True, f"{ratio}:1 — passes WCAG AAA"
    if aa:
        return True, f"{ratio}:1 — passes WCAG AA ({threshold}:1 required)"
    return False, f"{ratio}:1 — fails WCAG AA ({threshold}:1 required)"


# --------------------------------------------------------------------------- #
# individual checks
# --------------------------------------------------------------------------- #
def _finding(rule_key, category, severity, start, end, span_text, issue, why, impact, suggestion,
             visual_evidence: dict | None = None):
    out = {
        "rule_key": rule_key, "category": category, "severity": severity,
        "span_start": start, "span_end": end, "span_text": span_text,
        "issue": issue, "why": why, "impact": impact, "suggestion": suggestion,
        "deterministic": True, "evidence_strength": 1.0, "direct_contradiction": True,
    }
    if visual_evidence:
        out["visual_evidence"] = visual_evidence
    return out


def _visual(block: dict, *, bbox_norm, detected_text, kind, measured, expected,
            page: int | None = None) -> dict:
    """The pixels a visual finding is about, in the shape the UI highlights (B3).

    `measured` and `expected` are the numbers a person can check; when a value was not
    measured it stays None, and the interface prints "not measured" rather than a guess.
    """
    meta = block.get("meta") or {}
    return {
        "page": int(page or block.get("page") or 1),
        "bbox_norm": bbox_norm or meta.get("bbox") or [0.0, 0.0, 1.0, 1.0],
        "detected_text": (detected_text or meta.get("ocr_text") or "")[:280],
        "detected_value": {"kind": kind, "measured": measured, "expected": expected},
        "source": meta.get("source") or "upload",
        "ocr_confidence": meta.get("ocr_confidence"),
    }


def check_terms(text: str, terms: list[dict], rules_by_key: dict | None = None) -> list[dict]:
    """Approved / banned term lists. Whole-word, case-insensitive."""
    rules_by_key = rules_by_key or {}
    out: list[dict] = []
    for term in terms:
        value = (term.get("value") or "").strip()
        if not value or term.get("status") not in (None, "confirmed"):
            continue
        pattern = re.compile(r"(?<![\w-])" + re.escape(value) + r"(?![\w-])", re.I)
        for m in pattern.finditer(text):
            if term["kind"] == "banned":
                replacement = term.get("replacement")
                sug = f'Use “{replacement}” instead.' if replacement else "Remove this term."
                out.append(_finding(
                    term.get("rule_key") or "TERM-BANNED", "terminology", term.get("severity", "medium"),
                    m.start(), m.end(), m.group(0),
                    f'Banned term: “{m.group(0)}”',
                    f'“{value}” is on the Brand Kit banned-term list'
                    + (f'; the approved alternative is “{replacement}”' if replacement else '') + '.',
                    "Inconsistent or off-brand wording in published material.",
                    sug,
                ))
            elif term["kind"] == "required" and not replacement:
                continue
        # approved terms: flag common misspellings / wrong casing of the approved form
        if term["kind"] == "approved" and len(value) > 3:
            misspell = re.compile(r"(?<![\w-])" + re.escape(value) + r"s(?![\w-])", re.I)
            for m in misspell.finditer(text):
                if value.lower().endswith("s"):
                    continue
                out.append(_finding(
                    term.get("rule_key") or "TERM-APPROVED", "terminology", "low",
                    m.start(), m.end(), m.group(0),
                    f'Approved term written in the plural: “{m.group(0)}”',
                    f'The Brand Kit approves the singular form “{value}”.',
                    "Drifts from the approved vocabulary.",
                    f'Use “{value}” as written in the term list.',
                ))
    return out


def check_colours(text: str, palette: list[str], *, rule_key: str = "VIS-COLOUR") -> list[dict]:
    """Any hex colour in the content that is not in the approved palette."""
    allowed = {c.strip().lower() for c in palette if c}
    if not allowed:
        return []
    out = []
    for m in re.finditer(r"#([0-9a-fA-F]{6})\b", text):
        value = "#" + m.group(1).lower()
        if value not in allowed:
            out.append(_finding(
                rule_key, "visual", "medium", m.start(), m.end(), m.group(0),
                f"Off-brand colour {value}",
                "Only Brand Kit colours may be used: " + ", ".join(sorted(allowed)) + ".",
                "Colour drift weakens recognition and can fail contrast pairing checks.",
                "Replace with the nearest approved brand colour.",
            ))
    return out


def check_alt_text(blocks: list[dict], *, rule_key: str = "A11Y-ALT") -> list[dict]:
    """Every informative image must carry non-empty alt text."""
    out = []
    for b in blocks:
        if b.get("kind") != "image":
            continue
        alt = (b.get("meta") or {}).get("alt")
        if alt is None or (isinstance(alt, str) and not alt.strip()):
            out.append(_finding(
                rule_key, "accessibility", "high", b.get("start", 0), b.get("end", 0),
                b.get("text", ""),
                "Image is missing alt text",
                "WCAG 2.1 SC 1.1.1 requires a text alternative for every informative image.",
                "Screen-reader users receive no description of this image.",
                "Add a short description of what the image shows and why it matters.",
            ))
    return out


def check_contrast(text: str, pairs: list[tuple[str, str]] | None = None, *,
                   rule_key: str = "A11Y-CONTRAST") -> list[dict]:
    """Contrast for declared colour pairs.

    Pairs come from the Brand Kit's text/background pairings and from any
    explicit "text #xxxxxx on #yyyyyy" declaration in the content.
    """
    found_pairs: list[tuple[str, str, int, int, str]] = []
    for fg, bg in (pairs or []):
        try:
            hex_to_rgb(fg), hex_to_rgb(bg)
        except ValueError:
            continue
        found_pairs.append((fg, bg, 0, 0, f"{fg} on {bg}"))
    for m in re.finditer(r"([#][0-9a-fA-F]{6})\s+(?:text\s+)?on\s+([#][0-9a-fA-F]{6})", text, re.I):
        found_pairs.append((m.group(1), m.group(2), m.start(), m.end(), m.group(0)))

    out = []
    for fg, bg, start, end, label in found_pairs:
        try:
            ratio = contrast_ratio(fg, bg)
        except ValueError:
            continue
        ok, verdict = wcag_verdict(ratio)
        if ok:
            continue
        out.append(_finding(
            rule_key, "accessibility", "high", start, end, label,
            f"Contrast too low: {fg} on {bg} ({verdict})",
            "Brand accessibility rule: body text must meet WCAG 2.1 AA contrast (4.5:1).",
            "Text becomes unreadable for low-vision users and fails accessibility audits.",
            "Darken the text colour or lighten the background until at least 4.5:1.",
        ))
    return out


def check_image_quality(blocks: list[dict], *, min_width: int = 800, rule_key: str = "VIS-QUALITY") -> list[dict]:
    out = []
    for b in blocks:
        if b.get("kind") != "image":
            continue
        meta = b.get("meta") or {}
        w = int(meta.get("width") or 0)
        if w and w < min_width:
            out.append(_finding(
                rule_key, "visual", "medium", b.get("start", 0), b.get("end", 0), b.get("text", ""),
                f"Image resolution too low ({w}px wide)",
                f"Brand images must be at least {min_width}px wide.",
                "The asset will look soft on retina screens and may be rejected by ad platforms.",
                f"Re-export at a width of at least {min_width * 2}px.",
                visual_evidence=_visual(
                    b, bbox_norm=meta.get("bbox"), detected_text=meta.get("ocr_text"),
                    kind="pixels", measured=f"{w}px wide",
                    expected=f"at least {min_width}px wide"),
            ))
    return out


def _analysis(block: dict) -> dict:
    """The measurement block recorded at upload by `services/image_analysis.py`."""
    return ((block.get("meta") or {}).get("analysis") or {})


def check_image_palette(blocks: list[dict], *, rule_key: str = "VIS-COLOUR",
                        share_threshold: float = 0.30) -> list[dict]:
    """A dominant colour that is far from every approved brand colour.

    Only runs when pixels were actually measured (`meta.analysis`) and the Brand Kit has
    an approved palette; an image whose colours were never sampled produces no finding,
    because nothing was measured to report.
    """
    out = []
    for b in blocks:
        if b.get("kind") != "image":
            continue
        palette = _analysis(b).get("palette") or {}
        approved = palette.get("palette") or []
        if not approved:
            continue
        offenders = [c for c in (palette.get("colours") or [])
                     if not ((c.get("nearest") or {}).get("within_tolerance"))]
        if not offenders:
            continue
        worst = max(offenders, key=lambda c: c.get("share") or 0)
        if (worst.get("share") or 0) < share_threshold:
            continue
        nearest = worst.get("nearest") or {}
        out.append(_finding(
            rule_key, "visual", "medium", b.get("start", 0), b.get("end", 0), b.get("text", ""),
            f"Off-brand colour {worst['hex']} fills {round(100 * worst['share'])}% of the image",
            "Approved brand colours: " + ", ".join(approved) + ".",
            "Colour drift weakens recognition and can fail contrast pairing checks.",
            f"Recolour towards {nearest.get('approved', 'the nearest brand colour')} "
            f"(measured distance ΔE {nearest.get('delta_e')}).",
            visual_evidence=_visual(
                b, bbox_norm=[0.0, 0.0, 1.0, 1.0],
                detected_text=f"{worst['hex']} over {round(100 * worst['share'])}% of the image",
                kind="colour",
                measured=f"{worst['hex']} · ΔE {nearest.get('delta_e')} from {nearest.get('approved')}",
                expected=f"within ΔE {nearest.get('tolerance')} of an approved brand colour "
                         f"({', '.join(approved)})"),
        ))
    return out


def check_image_contrast_text(blocks: list[dict], *, rule_key: str = "A11Y-CONTRAST",
                              min_ratio: float = 4.5) -> list[dict]:
    """Contrast measured *inside* the picture, over the boxes OCR found words in.

    Text baked into an image declares no colours, so the darkest decile of each word box
    is taken as the ink and the lightest as the paper (see
    `image_analysis.text_contrast_in_box`). Both sampled colours are reported, so the
    reviewer can check the reasoning rather than trust a score.
    """
    out = []
    for b in blocks:
        if b.get("kind") != "image":
            continue
        analysis = _analysis(b)
        lines = [ln for ln in (analysis.get("ocr_lines") or []) if ln.get("ratio") is not None]
        if not lines:
            continue
        worst = min(lines, key=lambda ln: ln["ratio"])
        if worst["ratio"] >= min_ratio:
            continue
        out.append(_finding(
            rule_key, "accessibility", "high", b.get("start", 0), b.get("end", 0), b.get("text", ""),
            f"Text in the image has {worst['ratio']}:1 contrast: “{worst['text'][:60]}”",
            f"Brand accessibility rule: text must meet WCAG 2.1 AA contrast ({min_ratio}:1).",
            "Text baked into an image cannot be restyled by a reader or a browser.",
            f"Darken the text or lighten the background until the ratio reaches {min_ratio}:1, "
            "or move the text out of the image.",
            visual_evidence=_visual(
                b, bbox_norm=worst.get("bbox_norm"), detected_text=worst.get("text"),
                kind="contrast",
                measured=f"{worst['ratio']}:1 ({worst['ink']} on {worst['paper']})",
                expected=f"at least {min_ratio}:1"),
        ))
    return out


def check_image_aspect(blocks: list[dict], allowed_ratios: dict | list | None, *,
                       content_type: str | None = None, rule_key: str = "VIS-QUALITY",
                       tolerance: float = 0.02) -> list[dict]:
    """Delivered aspect ratio that no approved ratio covers, measured from the pixels."""
    allowed = allowed_ratios
    if isinstance(allowed, dict):
        allowed = allowed.get(content_type or "") if content_type else None
        if allowed is None:
            # a kit that only declares ratios for other content types says nothing about this one
            allowed = []
    allowed_vals = [round(float(r), 3) for r in (allowed or [])]
    if not allowed_vals:
        return []
    out = []
    for b in blocks:
        if b.get("kind") != "image":
            continue
        analysis = _analysis(b)
        ratio = (analysis.get("aspect") or {}).get("ratio")
        if not ratio:
            continue
        nearest = analysis.get("allowed_ratio") or {}
        if any(abs(ratio - r) <= tolerance for r in allowed_vals):
            continue
        out.append(_finding(
            rule_key, "visual", "medium", b.get("start", 0), b.get("end", 0), b.get("text", ""),
            f"Aspect ratio {ratio:.2f}:1 is not approved" + (f" for {content_type}" if content_type else ""),
            "Approved ratios: " + ", ".join(f"{r:.2f}:1" for r in allowed_vals) + ".",
            "The channel will crop the image, which can cut text or the logo.",
            (f"Crop to {nearest.get('allowed'):.2f}:1." if nearest.get("allowed")
             else f"Crop to {allowed_vals[0]:.2f}:1."),
            visual_evidence=_visual(
                b, bbox_norm=[0.0, 0.0, 1.0, 1.0], detected_text=analysis.get("ocr_text"),
                kind="aspect_ratio", measured=f"{ratio:.2f}:1",
                expected="one of " + ", ".join(f"{r:.2f}:1" for r in allowed_vals)),
        ))
    return out


def check_logo_similarity(blocks: list[dict], logos: list[dict] | None = None, *,
                          rule_key: str = "VIS-LOGO") -> list[dict]:
    """A picture that looks like a *retired* logo, reported as Possible and nothing more (B5).

    The hash only ever says "within ten bits of"; two different marks can land that close.
    So the finding is always labelled Possible (never Confirmed), the measured distance is
    printed, and a match against a current logo raises nothing at all — an approved mark in
    the artwork is not a finding.
    """
    from .phash import best_match

    current = next((l.get("version") for l in (logos or [])
                    if (l.get("status") or "") == "confirmed" and l.get("version")), None)
    out = []
    for b in blocks:
        if b.get("kind") != "image":
            continue
        image_hash = (b.get("meta") or {}).get("phash")
        if not image_hash:
            continue
        match = best_match(image_hash, logos or [])
        if not match or not match.get("similar") or (match.get("status") or "") != "retired":
            continue
        out.append(_finding(
            rule_key, "visual", "medium", b.get("start", 0), b.get("end", 0), b.get("text", ""),
            f"Possible outdated logo: looks like {match['name']} v{match.get('version')}",
            f"The approved mark is version {current or 'current'}; "
            f"v{match.get('version')} is retired.",
            "Old marks carry superseded typography and colour, and signal a stale brand.",
            f"Replace with the current logo (version {current or 'in the Brand Kit'}).",
            visual_evidence=_visual(
                b, bbox_norm=[0.0, 0.0, 1.0, 1.0], detected_text=(b.get("meta") or {}).get("ocr_text"),
                kind="logo_similarity",
                measured=f"perceptual hash distance {match['distance']}/64 from "
                         f"{match['name']} v{match.get('version')}",
                expected=f"the current logo (v{current or 'current'})"),
        ))
        out[-1]["possible_only"] = True
    return out


def image_checks(blocks: list[dict], *, palette: list[str] | None = None,
                 allowed_ratios: dict | list | None = None, content_type: str | None = None,
                 min_width: int = 800, logos: list[dict] | None = None) -> list[dict]:
    """Every pixel-backed check, for blocks that carry a measurement."""
    findings: list[dict] = []
    findings += check_image_quality(blocks, min_width=min_width)
    findings += check_image_palette(blocks)
    findings += check_image_contrast_text(blocks)
    findings += check_image_aspect(blocks, allowed_ratios, content_type=content_type)
    findings += check_logo_similarity(blocks, logos)
    return findings


def visual_evidence_for_span(block: dict, span_text: str) -> dict | None:
    """Where inside the picture a text finding sits, from the OCR word boxes (B3).

    A banned term caught in text that was OCR'd out of an image gets the same treatment
    as a measured colour: the reviewer is shown the box the words were found in, rather
    than only the phrase. Returns None when the span cannot be located in the boxes,
    because a wrong highlight is worse than no highlight.
    """
    meta = block.get("meta") or {}
    words = meta.get("ocr_words") or []
    if not words:
        return None
    wanted = [w for w in re.split(r"\W+", (span_text or "").lower()) if len(w) > 1]
    if not wanted:
        return None
    hits = [w for w in words if (w.get("text") or "").lower().strip(".,;:!?\"'") in wanted]
    if not hits:
        return None
    boxes = [{"left": w.get("left", 0), "top": w.get("top", 0),
              "width": w.get("width", 0), "height": w.get("height", 0)} for w in hits]
    left = min(bx["left"] for bx in boxes)
    top = min(bx["top"] for bx in boxes)
    right = max(bx["left"] + bx["width"] for bx in boxes)
    bottom = max(bx["top"] + bx["height"] for bx in boxes)
    # A text finding can land in an OCR paragraph block rather than on the image block;
    # that block carries the word boxes but not the picture's dimensions, so the largest
    # word extent stands in for them (boxes are then normalised to the text area).
    w_px = (int(meta.get("width") or meta.get("image_width") or 0)
            or max(bx["left"] + bx["width"] for bx in boxes) or 1)
    h_px = (int(meta.get("height") or meta.get("image_height") or 0)
            or max(bx["top"] + bx["height"] for bx in boxes) or 1)
    bbox = [round(max(0.0, left / w_px), 4), round(max(0.0, top / h_px), 4),
            round(min(1.0, right / w_px), 4), round(min(1.0, bottom / h_px), 4)]
    return {
        "page": int(block.get("page") or 1),
        "bbox_norm": bbox,
        "detected_text": " ".join(w.get("text", "") for w in hits)[:280] or (span_text or "")[:280],
        "detected_value": {
            "kind": "text",
            "measured": span_text,
            "expected": None,
        },
        "source": "ocr",
        "ocr_confidence": meta.get("ocr_confidence"),
    }


def run_all(text: str, blocks: list[dict], kit: dict) -> list[dict]:
    """Run every deterministic check. `kit` supplies terms, palette and contrast pairs."""
    terms = kit.get("terms", [])
    palette = kit.get("palette", []) or []
    pairs = kit.get("contrast_pairs", []) or []
    findings: list[dict] = []
    findings += check_terms(text, terms)
    findings += check_colours(text, palette)
    findings += check_alt_text(blocks)
    findings += check_contrast(text, pairs)
    findings += check_image_quality(blocks)
    findings += check_image_palette(blocks)
    findings += check_image_contrast_text(blocks)
    return findings


def dedupe_terms(findings: list[dict]) -> list[dict]:
    """Two term rules can fire on the same span (banned + approved). Keep the strongest."""
    seen: dict[tuple[int, int], dict] = {}
    order = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    for f in findings:
        key = (f["span_start"], f["span_end"])
        if key not in seen or order[f["severity"]] > order[seen[key]["severity"]]:
            seen[key] = f
    return list(seen.values())
