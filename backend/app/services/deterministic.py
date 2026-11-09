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
def _finding(rule_key, category, severity, start, end, span_text, issue, why, impact, suggestion):
    return {
        "rule_key": rule_key, "category": category, "severity": severity,
        "span_start": start, "span_end": end, "span_text": span_text,
        "issue": issue, "why": why, "impact": impact, "suggestion": suggestion,
        "deterministic": True, "evidence_strength": 1.0, "direct_contradiction": True,
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
            ))
    return out


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
