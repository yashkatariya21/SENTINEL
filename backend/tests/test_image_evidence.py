"""Workstream B — image evidence and OCR.

Everything asserted here is a *measurement*: word boxes from tesseract, pixel counts,
WCAG contrast over sampled pixels, a difference hash. Where a measurement cannot be made
(tesseract not installed, no approved palette, a pasted item with no file) the code must
report nothing at all rather than invent something, and these tests hold it to that.
"""
from __future__ import annotations

import io

import pytest
from PIL import Image, ImageDraw, ImageFont

from app.config import settings
from app.services import extraction, image_analysis, phash
from app.services.extraction import _ocr_available


# --------------------------------------------------------------------------- #
# fixtures / helpers
# --------------------------------------------------------------------------- #
def png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _font(size: int = 44):
    """A readable font: tesseract needs glyphs big enough to recognise, not 8px hairlines."""
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10 has no size argument
        return ImageFont.load_default()


def poster(*, block_colour=(232, 85, 47), text_colour=(150, 150, 150)) -> bytes:
    """A 1000×1000 social post: one big off-brand block and mid-grey text on white.

    Two separate problems the assertions can tell apart: the block fills ~55% of the
    picture (colour) and the text measures about 3:1 on white (contrast, needs 4.5:1).
    The grey is deliberately light enough to fail accessibility and dark enough that
    tesseract can still read it — at 1.4:1 nothing, human or machine, could read it.
    """
    im = Image.new("RGB", (1000, 1000), "white")
    draw = ImageDraw.Draw(im)
    draw.rectangle([40, 40, 960, 560], fill=block_colour)
    font = _font(48)
    draw.text((60, 640), "Our CHEAP forecast", fill=text_colour, font=font)
    draw.text((60, 720), "plan is the best", fill=text_colour, font=font)
    return png_bytes(im)


def logo_png(shape: str = "circle") -> bytes:
    """A simple two-tone mark. Two different shapes hash to different bits."""
    im = Image.new("RGB", (240, 240), "white")
    draw = ImageDraw.Draw(im)
    if shape == "circle":
        draw.ellipse([30, 30, 210, 210], fill=(11, 61, 145))
    elif shape == "square":
        draw.rectangle([30, 30, 210, 210], fill=(11, 61, 145))
    else:  # a busy, unrelated glyph
        for i in range(0, 240, 24):
            draw.rectangle([i, 0, i + 12, 240], fill=(242, 169, 0) if i % 48 else (26, 26, 26))
    return png_bytes(im)


def ocr_on(monkeypatch):
    """Turn OCR on for real (tesseract is installed in CI and in the Docker image)."""
    monkeypatch.setattr(settings, "ocr_enabled", True, raising=False)
    _ocr_available.cache_clear()


def ocr_off(monkeypatch):
    monkeypatch.setattr(settings, "ocr_enabled", False, raising=False)
    _ocr_available.cache_clear()


def needs_tesseract() -> bool:
    try:
        import pytesseract

        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


TESSERACT = pytest.mark.skipif(not needs_tesseract(), reason="tesseract binary not installed")


def _upload(client, headers, data: bytes, *, title: str, content_type: str = "social_post",
            filename: str = "poster.png", alt: str | None = "A poster") -> dict:
    form = {"title": title, "content_type": content_type}
    if alt is not None:
        form["alt"] = alt
    resp = client.post("/v1/content/upload", headers=headers,
                       files={"file": (filename, data, "image/png")}, data=form)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _analyse(client, headers, item_id: str) -> dict:
    resp = client.post(f"/v1/content/{item_id}/analyze", headers=headers)
    assert resp.status_code in (200, 202), resp.text
    run = client.get(f"/v1/analysis-runs/{resp.json()['id']}", headers=headers)
    assert run.status_code == 200, run.text
    return run.json()


# --------------------------------------------------------------------------- #
# B1 — OCR: word boxes, not just a string
# --------------------------------------------------------------------------- #
def test_ocr_is_off_by_default_and_says_nothing_rather_than_guessing(monkeypatch):
    """With OCR disabled the picture is still described; nothing is invented about its text."""
    ocr_off(monkeypatch)
    blocks, pages = extraction.extract_image(poster(), alt="A poster")
    assert pages == 1
    image = next(b for b in blocks if b["kind"] == "image")
    assert image["meta"]["ocr"] is False
    assert image["meta"]["ocr_text"] == ""
    assert image["meta"]["ocr_words"] == []
    assert not any(b["kind"] == "paragraph" for b in blocks)


@TESSERACT
def test_ocr_returns_word_boxes_in_normalised_coordinates(monkeypatch):
    ocr_on(monkeypatch)
    blocks, _pages = extraction.extract_image(poster(), alt="A poster")
    image = next(b for b in blocks if b["kind"] == "image")
    meta = image["meta"]

    assert meta["ocr"] is True
    words = [w["text"].lower().strip(".,") for w in meta["ocr_words"]]
    assert "cheap" in words, words
    assert meta["ocr_lines"], "lines are grouped so a phrase can be highlighted, not single letters"

    for word in meta["ocr_words"]:
        x0, y0, x1, y1 = word["bbox_norm"]
        assert 0.0 <= x0 < x1 <= 1.0
        assert 0.0 <= y0 < y1 <= 1.0
        assert word["width"] > 0 and word["height"] > 0
        assert 0.0 <= word["confidence"] <= 1.0
    # and the OCR text reached the body text, so text reviewers can read it
    body = next(b for b in blocks if b["kind"] == "paragraph")
    assert body["meta"]["source"] == "ocr"
    assert "cheap" in body["text"].lower()


def test_a_scan_with_no_text_layer_is_rasterised_and_read(monkeypatch):
    """A PDF with a picture and no text layer is a scan: the page is rendered and OCR'd."""
    ocr_on(monkeypatch)
    pytest.importorskip("fitz")
    import fitz

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    pix = fitz.Pixmap(io.BytesIO(poster()))
    page.insert_image(fitz.Rect(40, 40, 555, 555), pixmap=pix)
    data = doc.tobytes()
    doc.close()

    blocks, pages = extraction.extract_pdf(data)
    assert pages == 1
    image_blocks = [b for b in blocks if b["kind"] == "image"]
    assert image_blocks, "the embedded picture must still be reported"
    assert image_blocks[0]["meta"]["bbox"] != [0.0, 0.0, 1.0, 1.0], "placement is recorded, not assumed"

    scanned = [b for b in blocks if (b.get("meta") or {}).get("rasterised")]
    if not scanned:
        pytest.skip("this tesseract build could not read the rasterised page")
    assert "cheap" in scanned[0]["text"].lower()


def test_a_page_with_real_text_is_not_rasterised(monkeypatch):
    """A born-digital PDF keeps its own text; OCR must not run over it and duplicate it."""
    ocr_on(monkeypatch)
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Our cheap plan is the best plan, guaranteed.")
    data = doc.tobytes()
    doc.close()

    blocks, _pages = extraction.extract_pdf(data)
    assert not [b for b in blocks if (b.get("meta") or {}).get("rasterised")]
    assert any("cheap" in (b.get("text") or "").lower() for b in blocks)


def test_the_container_ships_the_tesseract_binary():
    """OCR is configured where it runs: the image installs tesseract and switches it on."""
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    dockerfile = (root / "Dockerfile").read_text()
    requirements = (root / "requirements.txt").read_text()
    assert "tesseract-ocr" in dockerfile
    assert "OCR_ENABLED=1" in dockerfile
    assert "pytesseract" in requirements
    assert "# pytesseract" not in requirements, "pytesseract must not be commented out"


# --------------------------------------------------------------------------- #
# B2 — measurements, and the honesty rules around them
# --------------------------------------------------------------------------- #
def test_dominant_colours_are_counted_not_guessed():
    im = Image.new("RGB", (100, 100), (11, 61, 145))
    ImageDraw.Draw(im).rectangle([0, 0, 40, 100], fill=(255, 0, 0))
    colours = image_analysis.dominant_colours(im, limit=2)
    assert colours[0]["hex"] in ("#FF0000", "#0B3D91")
    assert abs(sum(c["share"] for c in colours) - 1.0) < 0.02
    shares = sorted((c["share"] for c in colours), reverse=True)
    assert shares[0] >= shares[1]


def test_palette_distance_is_a_colour_distance_not_an_equality_test():
    palette = ["#0B3D91", "#F2A900", "#1A1A1A", "#FFFFFF"]
    near = image_analysis.nearest_palette("#123A8A", palette)
    assert near["approved"] == "#0B3D91"
    assert near["within_tolerance"] is True, "a slightly-off navy is still navy"

    far = image_analysis.nearest_palette("#E8552F", palette)
    assert far["within_tolerance"] is False
    assert far["delta_e"] > far["tolerance"]


def test_contrast_is_measured_from_the_pixels_in_the_box():
    """Black text on white measures near 21:1; grey on white fails; both are reported."""
    strong = Image.new("RGB", (200, 60), "white")
    ImageDraw.Draw(strong).text((10, 20), "Readable", fill=(0, 0, 0))
    faint = Image.new("RGB", (200, 60), "white")
    ImageDraw.Draw(faint).text((10, 20), "Faint", fill=(200, 200, 200))

    box = {"left": 0, "top": 0, "width": 200, "height": 60}
    good = image_analysis.text_contrast_in_box(strong, box)
    bad = image_analysis.text_contrast_in_box(faint, box)
    assert good and bad
    assert good["ratio"] > bad["ratio"]
    assert bad["ratio"] < 4.5
    # the sampled colours travel with the number, so a reviewer can check the reasoning
    assert good["ink"] != good["paper"]
    assert bad["ink"].startswith("#") and bad["paper"].startswith("#")


def test_an_image_with_no_palette_is_measured_but_not_judged():
    report = image_analysis.analyse_image(Image.open(io.BytesIO(poster())), palette=[])
    assert report["palette"]["colours"], "colours are still measured"
    assert all(c["nearest"] is None for c in report["palette"]["colours"])
    assert report["palette"]["notes"], "and the report says why nothing was judged"


def test_aspect_ratio_and_its_nearest_approved_value():
    report = image_analysis.aspect_ratio(1000, 1000)
    assert report["ratio"] == 1.0
    nearest = image_analysis.nearest_allowed_ratio(1.0, [1.0, 0.8, 1.778])
    assert nearest["within_tolerance"] is True
    off = image_analysis.nearest_allowed_ratio(1.35, [1.0, 0.8, 1.778])
    assert off["within_tolerance"] is False


def test_unreadable_bytes_measure_to_none_rather_than_raising():
    assert image_analysis.analyse_bytes(b"not an image") is None
    assert phash.phash_bytes(b"not an image") is None


# --------------------------------------------------------------------------- #
# B3 — visual evidence on the finding itself
# --------------------------------------------------------------------------- #
@TESSERACT
def test_a_pixel_problem_arrives_with_the_box_and_the_measurement(client, auth, monkeypatch):
    ocr_on(monkeypatch)
    headers = auth("rhea@northwind.example")
    item = _upload(client, headers, poster(), title="B3 pixel evidence")
    run = _analyse(client, headers, item["id"])
    assert run["status"] == "complete", run

    visual = [f for f in run["findings"] if f.get("visual_evidence")]
    assert visual, "an image review must carry at least one finding with pixels attached"

    by_kind = {f["visual_evidence"]["detected_value"]["kind"]: f for f in visual}
    colour = by_kind.get("colour")
    assert colour, [f["visual_evidence"]["detected_value"]["kind"] for f in visual]
    evidence = colour["visual_evidence"]
    assert evidence["page"] == 1
    x0, y0, x1, y1 = evidence["bbox_norm"]
    assert 0.0 <= x0 < x1 <= 1.0 and 0.0 <= y0 < y1 <= 1.0
    assert "#E8552F" in evidence["detected_value"]["measured"]
    assert "ΔE" in evidence["detected_value"]["expected"]

    contrast = by_kind.get("contrast")
    assert contrast, "the faint text must be measured, not assumed"
    assert ":1" in contrast["visual_evidence"]["detected_value"]["measured"]
    assert contrast["visual_evidence"]["detected_text"].strip()


@TESSERACT
def test_text_found_in_a_picture_points_at_the_words_in_it(client, auth, monkeypatch):
    ocr_on(monkeypatch)
    headers = auth("rhea@northwind.example")
    item = _upload(client, headers, poster(), title="B3 text in image")
    run = _analyse(client, headers, item["id"])
    assert run["status"] == "complete", run

    text_cases = [f for f in run["findings"]
                  if (f.get("visual_evidence") or {}).get("detected_value", {}).get("kind") == "text"]
    assert text_cases, [f["issue"] for f in run["findings"]]
    case = text_cases[0]
    evidence = case["visual_evidence"]
    assert evidence["source"] == "ocr"
    assert evidence["detected_text"].strip(), "the words that were read are quoted back"
    x0, y0, x1, y1 = evidence["bbox_norm"]
    assert 0.0 <= x0 < x1 <= 1.0 and 0.0 <= y0 < y1 <= 1.0
    assert y0 > 0.5, "the two lines of copy sit in the lower half of the poster"

    # The banned term was read out of the picture too, so its finding points at the word.
    banned = [f for f in run["findings"] if "cheap" in (f["span_text"] or "").lower()]
    assert banned, [f["issue"] for f in run["findings"]]
    assert banned[0]["visual_evidence"] is not None, "a word caught in the image gets its box"
    assert banned[0]["visual_evidence"]["detected_value"]["kind"] == "text"
    assert "cheap" in banned[0]["visual_evidence"]["detected_text"].lower()
    # the rule's own remedy travels with the box, so the caption reads measured -> expected
    assert banned[0]["visual_evidence"]["detected_value"]["expected"] == banned[0]["suggestion"]
    assert banned[0]["visual_evidence"]["detected_value"]["expected"]


def test_the_rules_remedy_travels_with_the_box(monkeypatch):
    """measured = what was read; expected = what the rule says it should say instead."""
    ocr_off(monkeypatch)
    from app.services.pipeline import _span_visual_evidence

    blocks = [{
        "id": "b1", "kind": "paragraph", "text": "Our CHEAP plan", "start": 0, "end": 14, "page": 1,
        "meta": {"source": "ocr", "image_width": 1000, "image_height": 1000,
                 "ocr_words": [
                     {"text": "Our", "left": 10, "top": 10, "width": 60, "height": 30},
                     {"text": "CHEAP", "left": 80, "top": 10, "width": 120, "height": 30},
                 ]},
    }]
    evidence = _span_visual_evidence(blocks, {
        "span_start": 4, "span_end": 9, "span_text": "CHEAP",
        "suggestion": "Use “affordable” instead.",
    })
    assert evidence is not None
    assert evidence["detected_value"]["measured"] == "CHEAP"
    assert evidence["detected_value"]["expected"] == "Use “affordable” instead."
    assert evidence["bbox_norm"] == [0.08, 0.01, 0.2, 0.04], "the box is the word, not the line"

    # and with no remedy stated, expected stays None instead of being made up
    bare = _span_visual_evidence(blocks, {"span_start": 4, "span_end": 9, "span_text": "CHEAP"})
    assert bare["detected_value"]["expected"] is None


def test_a_pasted_item_has_no_visual_evidence_because_there_is_no_picture(client, auth, monkeypatch):
    ocr_off(monkeypatch)
    headers = auth("rhea@northwind.example")
    resp = client.post("/v1/content", headers=headers, json={
        "title": "B3 no picture", "content_type": "blog",
        "text": "Our cheap plan is the best plan. " * 6,
    })
    assert resp.status_code == 201, resp.text
    run = _analyse(client, headers, resp.json()["id"])
    assert all(f.get("visual_evidence") is None for f in run["findings"])


def test_an_image_without_measurements_produces_no_pixel_findings(monkeypatch):
    """Metadata-only images (dimensions, no sampled pixels) must not yield pixel findings."""
    ocr_off(monkeypatch)
    blocks = [{"id": "b1", "kind": "image", "text": "[image 1000×1000]", "start": 0, "end": 4,
               "page": 1, "meta": {"width": 1000, "height": 1000, "alt": "x"}}]
    findings = __import__("app.services.deterministic", fromlist=["x"]).image_checks(
        blocks, palette=["#0B3D91"], allowed_ratios={"social_post": [1.0]},
        content_type="social_post")
    assert findings == []


# --------------------------------------------------------------------------- #
# B4 — the stored original, served safely
# --------------------------------------------------------------------------- #
@TESSERACT
def test_the_original_is_served_to_the_owner_with_nosniff(client, auth, monkeypatch):
    ocr_on(monkeypatch)
    headers = auth("rhea@northwind.example")
    data = poster()
    item = _upload(client, headers, data, title="B4 original")
    resp = client.get(f"/v1/content/{item['id']}/original", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "image/png"
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.content == data, "the bytes served are the bytes uploaded"


def test_the_original_is_role_checked(client, auth, monkeypatch):
    ocr_off(monkeypatch)
    owner = auth("rhea@northwind.example")     # creator
    other = auth("nikhil@northwind.example")   # external creator, different person
    manager = auth("karan@northwind.example")
    item = _upload(client, owner, poster(), title="B4 permissions", alt="A poster")

    assert client.get(f"/v1/content/{item['id']}/original", headers=owner).status_code == 200
    assert client.get(f"/v1/content/{item['id']}/original", headers=other).status_code == 403
    assert client.get(f"/v1/content/{item['id']}/original", headers=manager).status_code == 200


def test_the_original_endpoint_refuses_text_and_missing_files(client, auth, monkeypatch):
    ocr_off(monkeypatch)
    headers = auth("rhea@northwind.example")
    pasted = client.post("/v1/content", headers=headers, json={
        "title": "B4 pasted", "content_type": "blog", "text": "No file here. " * 8}).json()
    assert client.get(f"/v1/content/{pasted['id']}/original", headers=headers).status_code == 404

    unknown = client.get("/v1/content/does-not-exist/original", headers=headers)
    assert unknown.status_code in (403, 404)


# --------------------------------------------------------------------------- #
# B5 — logo similarity, always "Possible"
# --------------------------------------------------------------------------- #
def test_a_hash_is_stable_and_actually_discriminating():
    same = phash.phash_bytes(logo_png("circle"))
    assert same == phash.phash_bytes(logo_png("circle"))
    assert phash.similarity(same, same)["distance"] == 0

    other = phash.phash_bytes(logo_png("square"))
    scored = phash.similarity(same, other)
    assert scored["distance"] is not None
    assert 0 < scored["distance"] <= 64


def test_a_logo_asset_takes_png_only(client, auth):
    headers = auth("meera@northwind.example")  # brand manager
    kit = client.get("/v1/brand-kits", headers=headers).json()[0]
    asset = client.post("/v1/assets", headers=headers, json={
        "kind": "logo", "name": "Northwind test mark", "value": "test-mark.png",
        "version": "3.2", "status": "confirmed"}).json()

    jpeg = io.BytesIO()
    Image.new("RGB", (64, 64), "white").save(jpeg, format="JPEG")
    refused = client.post(f"/v1/assets/{asset['id']}/logo", headers=headers,
                          files={"file": ("mark.jpg", jpeg.getvalue(), "image/jpeg")})
    assert refused.status_code == 415, refused.text

    accepted = client.post(f"/v1/assets/{asset['id']}/logo", headers=headers,
                           files={"file": ("mark.png", logo_png("circle"), "image/png")})
    assert accepted.status_code == 200, accepted.text
    stored = [a for a in client.get("/v1/assets", headers=headers).json() if a["id"] == asset["id"]]
    assert stored and stored[0]["meta"].get("logo_png") is True


def test_a_logo_match_is_labelled_possible_and_never_confirmed(client, auth, monkeypatch):
    """A retired mark in the artwork is a hint for a person, not a verdict."""
    ocr_off(monkeypatch)
    from app.services import deterministic

    blocks = [{"id": "b1", "kind": "image", "text": "[image]", "start": 0, "end": 7, "page": 1,
               "meta": {"width": 240, "height": 240, "phash": phash.phash_bytes(logo_png("circle"))}}]
    logos = [
        {"name": "Northwind wordmark", "version": "3.2", "status": "confirmed",
         "phash": phash.phash_bytes(logo_png("glyph"))},
        {"name": "Northwind wordmark (retired)", "version": "2.0", "status": "retired",
         "phash": phash.phash_bytes(logo_png("circle"))},
    ]
    findings = deterministic.check_logo_similarity(blocks, logos)
    assert findings, "an identical retired mark must be reported"
    finding = findings[0]
    assert finding["possible_only"] is True, "a hash coincidence is never a confirmation"
    assert finding["visual_evidence"]["detected_value"]["kind"] == "logo_similarity"
    assert "/64" in finding["visual_evidence"]["detected_value"]["measured"]

    # a match against the *current* mark raises nothing — an approved logo is not a finding
    current_only = [logos[0], {**logos[1], "status": "confirmed"}]
    assert deterministic.check_logo_similarity(blocks, current_only) == []


def test_merge_keeps_a_possible_signal_possible():
    """Even with deterministic backing, `possible_only` must not be promoted to confirmed."""
    from app.services.pipeline import merge_findings

    text = "Our CHEAP plan"
    candidate = {
        "reviewer": "visual", "category": "visual", "severity": "medium",
        "span_start": 4, "span_end": 9, "span_text": "CHEAP", "issue": "Possible outdated logo",
        "why": "hash", "impact": "stale", "suggestion": "Swap it", "deterministic": True,
        "direct_contradiction": True, "evidence_strength": 1.0, "rule_key": "VIS-LOGO",
        "evidence": None, "run_index": 0, "metrics": {}, "possible_only": True,
        "visual_evidence": {"page": 1, "bbox_norm": [0, 0, 1, 1], "detected_text": "cheap",
                            "detected_value": {"kind": "logo_similarity", "measured": "3/64",
                                               "expected": "the current logo"}},
    }
    merged = merge_findings(text, [candidate], repeat_runs=1)
    assert merged[0]["label"] == "possible"
    assert merged[0]["visual_evidence"]["detected_value"]["kind"] == "logo_similarity"
