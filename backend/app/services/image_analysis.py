"""Measured facts about the pixels in an uploaded image (B2 — Explainability by Design).

Everything here is *measured*, never guessed: a dominant colour is a count of actual
pixels, a contrast ratio is computed from two sampled RGB values with the WCAG 2.1
formula the deterministic checks already use, and an aspect ratio is width ÷ height.
If OCR is unavailable the pixel checks still run; anything that could not be measured
is reported as ``None`` — the UI prints "not measured" for those, never a number.

Two deliberate restraints:

* Colours are compared with the nearest approved brand colour in CIE Lab (ΔE), not by
  hex equality. A photograph never contains exactly ``#0B3D91``; asking "is this
  photograph on-brand" only makes sense as a distance.
* The result is evidence, not a verdict. `image_analysis.findings` turns measurements
  into findings with a stated threshold, and the caller decides what to do with them.
"""
from __future__ import annotations

import io
import math
from collections import Counter

from PIL import Image

from .deterministic import contrast_ratio, hex_to_rgb

# An image is "brand-adjacent" when its dominant colour is within this colour distance
# of an approved colour. 12 ΔE(76) is roughly "clearly the same family to a designer";
# it is a reporting threshold, not a compliance rule, and it is printed in findings.
PALETTE_DELTA_E = 12.0
# Which pixels count as "the text" when measuring contrast over OCR word boxes.
_TEXT_DARKNESS_PERCENTILE = 0.10
# How many distinct colours to keep in the report.
DOMINANT_COLOURS = 5


# --------------------------------------------------------------------------- #
# colour maths (CIE Lab, D65)
# --------------------------------------------------------------------------- #
def _to_linear(channel: float) -> float:
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb_to_lab(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    r, g, b = (_to_linear(float(c)) for c in rgb[:3])
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 1.00000
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else (7.787 * t) + (16 / 116)

    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def delta_e(rgb_a: tuple[int, int, int], rgb_b: tuple[int, int, int]) -> float:
    """CIE76 colour difference — simple, deterministic, and enough to rank a palette."""
    la, aa, ba = rgb_to_lab(rgb_a)
    lb, ab, bb = rgb_to_lab(rgb_b)
    return round(math.sqrt((la - lb) ** 2 + (aa - ab) ** 2 + (ba - bb) ** 2), 2)


def to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*(int(round(c)) for c in rgb[:3]))


def _safe_hex(value: str) -> tuple[int, int, int] | None:
    try:
        return hex_to_rgb(value)
    except (ValueError, AttributeError):
        return None


# --------------------------------------------------------------------------- #
# measurements
# --------------------------------------------------------------------------- #
def dominant_colours(im: Image.Image, *, limit: int = DOMINANT_COLOURS) -> list[dict]:
    """The colours that actually occupy the most pixels, with their share.

    Downsampled first (max 256px on the long edge) so a 6000px poster costs the same as
    a thumbnail; the ordering is by pixel count on the reduced image, which is a faithful
    proxy for share of the original.
    """
    small = im.convert("RGB")
    small.thumbnail((256, 256))
    counts = Counter(small.getdata())
    total = sum(counts.values()) or 1
    out = []
    for rgb, n in counts.most_common(limit):
        out.append({"hex": to_hex(rgb), "rgb": list(rgb), "share": round(n / total, 4)})
    return out


def nearest_palette(colour_hex: str, palette: list[str]) -> dict | None:
    """The closest approved colour, by ΔE, with the distance that was measured."""
    rgb = _safe_hex(colour_hex)
    if rgb is None:
        return None
    best = None
    for approved in palette or []:
        target = _safe_hex(approved)
        if target is None:
            continue
        d = delta_e(rgb, target)
        if best is None or d < best["delta_e"]:
            best = {"approved": approved.upper(), "delta_e": d}
    if best is None:
        return None
    best["within_tolerance"] = best["delta_e"] <= PALETTE_DELTA_E
    best["tolerance"] = PALETTE_DELTA_E
    return best


def palette_report(im: Image.Image, palette: list[str], *, limit: int = DOMINANT_COLOURS) -> dict:
    """Dominant colours, each with its distance to the nearest approved colour.

    `unmatched_share` is the fraction of the image whose dominant colour sits outside
    the palette tolerance — the one number worth showing a human.
    """
    colours = dominant_colours(im, limit=limit)
    for c in colours:
        c["nearest"] = nearest_palette(c["hex"], palette)
    unmatched = sum(c["share"] for c in colours
                    if not (c["nearest"] or {}).get("within_tolerance"))
    return {
        "colours": colours,
        "palette": [p.upper() for p in (palette or [])],
        "unmatched_share": round(unmatched, 4),
        "notes": [] if palette else ["No approved palette in the Brand Kit; colours were measured, not judged."],
    }


def mean_colour(im: Image.Image, box: dict | None = None) -> tuple[int, int, int] | None:
    """Mean RGB of a pixel box (or the whole image). Box is {left, top, width, height}."""
    region = im.convert("RGB")
    if box:
        x0 = max(0, int(box["left"]))
        y0 = max(0, int(box["top"]))
        x1 = min(region.width, x0 + int(box["width"]))
        y1 = min(region.height, y0 + int(box["height"]))
        if x1 <= x0 or y1 <= y0:
            return None
        region = region.crop((x0, y0, x1, y1))
    pixels = list(region.getdata())
    if not pixels:
        return None
    n = len(pixels)
    return (sum(p[0] for p in pixels) // n, sum(p[1] for p in pixels) // n, sum(p[2] for p in pixels) // n)


def text_contrast_in_box(im: Image.Image, box: dict) -> dict | None:
    """Measured contrast between the darkest 10% and lightest 10% of an OCR word box.

    This is how a contrast problem is found inside a picture, where nothing declares a
    foreground and a background colour: assume the glyphs are the darkest decile and the
    paper behind them the lightest. Both sampled colours are returned so a reviewer can
    check the reasoning, and the ratio is the same WCAG formula used elsewhere.
    """
    region = im.convert("RGB")
    x0 = max(0, int(box["left"]))
    y0 = max(0, int(box["top"]))
    x1 = min(region.width, x0 + int(box["width"]))
    y1 = min(region.height, y0 + int(box["height"]))
    if x1 <= x0 or y1 <= y0:
        return None
    pixels = list(region.crop((x0, y0, x1, y1)).getdata())
    if len(pixels) < 16:
        return None

    def luminance(p: tuple[int, int, int]) -> float:
        r, g, b = (c / 255 for c in p)
        f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

    ordered = sorted(pixels, key=luminance)
    cut = max(1, int(len(ordered) * _TEXT_DARKNESS_PERCENTILE))
    ink = tuple(sum(c) // cut for c in zip(*ordered[:cut]))          # darkest decile
    paper = tuple(sum(c) // cut for c in zip(*ordered[-cut:]))       # lightest decile
    ink_hex, paper_hex = to_hex(ink), to_hex(paper)
    try:
        ratio = contrast_ratio(ink_hex, paper_hex)
    except ValueError:
        return None
    return {"ink": ink_hex, "paper": paper_hex, "ratio": ratio,
            "box_px": {"left": x0, "top": y0, "width": x1 - x0, "height": y1 - y0}}


def aspect_ratio(width: int, height: int) -> dict:
    if not width or not height:
        return {"ratio": None, "width": width, "height": height}
    return {"ratio": round(width / height, 3), "width": width, "height": height}


def nearest_allowed_ratio(ratio: float | None, allowed: list[float]) -> dict | None:
    if not ratio or not allowed:
        return None
    best = min(allowed, key=lambda a: abs(float(a) - ratio))
    return {"allowed": round(float(best), 3), "difference": round(abs(float(best) - ratio), 3),
            "within_tolerance": abs(float(best) - ratio) <= 0.02}


# --------------------------------------------------------------------------- #
# per-image analysis (called at upload; results live in the image block's meta)
# --------------------------------------------------------------------------- #
def analyse_image(im: Image.Image, *, palette: list[str] | None = None,
                  allowed_ratios: list[float] | None = None,
                  ocr_words: list[dict] | None = None) -> dict:
    """Everything measurable about one uploaded image, plus the contrast per OCR line."""
    w, h = im.size
    report: dict = {
        "width": w, "height": h,
        "aspect": aspect_ratio(w, h),
        "allowed_ratio": nearest_allowed_ratio(w / h if h else None, allowed_ratios or []),
        "palette": palette_report(im, palette or []),
        "ocr_lines": [],
        "contrast_measured": 0,
        "mean_colour": to_hex(mean_colour(im) or (0, 0, 0)),
    }
    for line in (ocr_words or [])[:40]:
        box = {"left": line.get("left", 0), "top": line.get("top", 0),
               "width": line.get("width", 0), "height": line.get("height", 0)}
        measured = text_contrast_in_box(im, box)
        if not measured:
            continue
        report["ocr_lines"].append({
            "text": line.get("text", ""),
            "bbox_norm": line.get("bbox_norm"),
            "ink": measured["ink"], "paper": measured["paper"],
            "ratio": measured["ratio"],
        })
        report["contrast_measured"] += 1
    report["lowest_contrast"] = (min((ln["ratio"] for ln in report["ocr_lines"]), default=None))
    return report


def analyse_bytes(data: bytes, *, palette: list[str] | None = None,
                  allowed_ratios: list[float] | None = None,
                  ocr_words: list[dict] | None = None) -> dict | None:
    """Same as `analyse_image`, from raw bytes. Returns None if the bytes are not an image."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            return analyse_image(im, palette=palette, allowed_ratios=allowed_ratios,
                                 ocr_words=ocr_words)
    except Exception:
        return None
