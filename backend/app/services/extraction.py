"""Text/image extraction for uploads and pasted content.

Produces `blocks` (with character offsets into `body_text`) plus embedded image
metadata (dimensions, alt text, declared font, page). OCR is optional and only
runs when pytesseract + tesseract are installed (`OCR_ENABLED=1`).

Submitted content is DATA. We never execute, evaluate or follow it; a scan for
prompt-injection patterns is recorded so the UI can warn the reviewer.
"""
from __future__ import annotations

import io
import re
from functools import lru_cache

from PIL import Image

INJECTION_PATTERNS = [
    r"ignore (?:all )?(?:previous|above|prior) instructions",
    r"disregard (?:the )?(?:system|previous) prompt",
    r"you are now (?:a|an|the) ",
    r"system prompt",
    r"reveal (?:your )?(?:prompt|instructions|api key)",
    r"</?(?:system|assistant|instructions?)>",
    r"\bBEGIN SYSTEM\b",
    r"act as (?:the )?(?:admin|administrator|approver|manager)",
    r"mark (?:this|all findings) as (?:approved|dismissed|confirmed)",
    r"skip (?:all )?(?:checks|review)",
]
_INJ = re.compile("|".join(INJECTION_PATTERNS), re.I)


def injection_scan(text: str) -> dict:
    hits = [m.group(0) for m in _INJ.finditer(text or "")]
    return {"detected": bool(hits), "matches": hits[:8], "note":
            "Submitted content is handled as data. Instruction-like text was detected and is shown to reviewers, not followed."}


def estimate_tokens(text: str) -> int:
    return max(1, int(len(re.findall(r"\S+", text)) / 0.75))


# --------------------------------------------------------------------------- #
def blocks_to_text(blocks: list[dict]) -> tuple[str, list[dict]]:
    """Join block texts with blank lines and stamp start/end offsets on each block."""
    parts, cursor, out = [], 0, []
    for i, b in enumerate(blocks):
        text = b.get("text", "")
        if i:
            parts.append("\n\n")
            cursor += 2
        start = cursor
        parts.append(text)
        cursor += len(text)
        item = dict(b)
        item.setdefault("id", f"b{i+1}")
        item.update({"start": start, "end": cursor})
        out.append(item)
    return "".join(parts), out


def text_to_blocks(text: str, *, page: int = 1) -> list[dict]:
    blocks: list[dict] = []
    for para in re.split(r"\n\s*\n", text.strip()):
        para = para.strip("\n")
        if not para.strip():
            continue
        kind = "paragraph"
        if para.startswith("#"):
            kind = "heading"
            para = para.lstrip("#").strip()
        elif re.match(r"^(?:[-•*]|\d+[.)])\s+", para):
            kind = "list"
        blocks.append({"id": "", "kind": kind, "text": para, "page": page, "meta": {}})
    return blocks


# --------------------------------------------------------------------------- #
def external_image_boxes(page) -> list[dict]:
    """Where each embedded image sits on the page, as a normalised box (B2).

    `get_image_info()` reports the *placed* rectangle, which is what a highlight needs;
    `get_images()` only reports the image object. Falls back to the full page when the
    PDF does not expose placement (older writers, some XObject chains).
    """
    rect = page.rect
    out: list[dict] = []
    try:
        infos = page.get_image_info(xrefs=True)
    except Exception:
        infos = []
    for info in infos:
        bbox = info.get("bbox") or ()
        if len(bbox) != 4 or not rect.width or not rect.height:
            continue
        x0, y0, x1, y1 = bbox
        out.append({
            "bbox_norm": [round(max(0.0, x0 / rect.width), 4), round(max(0.0, y0 / rect.height), 4),
                          round(min(1.0, x1 / rect.width), 4), round(min(1.0, y1 / rect.height), 4)],
            "width": int(info.get("width") or 0), "height": int(info.get("height") or 0),
            "xref": info.get("xref"),
        })
    return out


def rasterise_page(page, *, dpi: int = 200):
    """Render a PDF page to a PIL image at `dpi` so a scan can be read by OCR."""
    import fitz
    from PIL import Image as _Image

    zoom = max(1.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    return _Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def extract_pdf(data: bytes) -> tuple[list[dict], int]:
    import fitz  # PyMuPDF

    blocks: list[dict] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for pno, page in enumerate(doc, start=1):
            page_text_chars = 0
            for b in page.get_text("blocks"):
                x0, y0, x1, y1, text, _bno, btype = b
                clean = (text or "").strip()
                if btype == 0 and clean:
                    page_text_chars += len(clean)
                    blocks.append({"id": "", "kind": "paragraph", "text": clean, "page": pno, "meta": {}})
            placed = external_image_boxes(page)
            for img_index, img in enumerate(page.get_images(full=True)):
                try:
                    pix = doc.extract_image(img[0])
                    with Image.open(io.BytesIO(pix["image"])) as im:
                        w, h = im.size
                except Exception:
                    w, h = img[2], img[3]
                meta = {"width": w, "height": h, "page": pno,
                        "bbox": placed[img_index]["bbox_norm"] if img_index < len(placed)
                        else [0.0, 0.0, 1.0, 1.0]}
                blocks.append({
                    "id": "", "kind": "image", "text": f"[image {img_index + 1} on page {pno}]",
                    "page": pno, "meta": meta,
                })

            # A page with pictures but (almost) no text is a scan: read the pixels.
            # Threshold, not zero, because a scanned letterhead often carries one
            # stray line of real text beside the picture.
            scanned = page_text_chars < 40 and bool(placed or page.get_images(full=True))
            if scanned and _ocr_available()[0]:
                ocr = _ocr_pdf_page(page, pno)
                if ocr["text"].strip():
                    blocks.append({"id": "", "kind": "paragraph", "text": ocr["text"].strip(),
                                   "page": pno,
                                   "meta": {"source": "ocr", "rasterised": True,
                                            "ocr_confidence": ocr["mean_confidence"],
                                            "ocr_words": ocr["words"][:600],
                                            "ocr_lines": ocr["lines"][:200],
                                            "bbox": [0.0, 0.0, 1.0, 1.0]}})
            if not any(b["page"] == pno for b in blocks):
                blocks.append({"id": "", "kind": "paragraph", "text": f"[page {pno}: no extractable text]",
                               "page": pno, "meta": {"empty": True}})
        pages = doc.page_count
    return blocks, pages


def _ocr_pdf_page(page, pno: int, *, dpi: int = 200) -> dict:
    empty = {"text": "", "words": [], "lines": [], "mean_confidence": None}
    try:
        return ocr_words(rasterise_page(page, dpi=dpi))
    except Exception:
        return empty


def extract_docx(data: bytes) -> tuple[list[dict], int]:
    import docx
    from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: F401

    document = docx.Document(io.BytesIO(data))
    blocks: list[dict] = []
    for para in document.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style = (para.style.name or "").lower()
        kind = "heading" if style.startswith("heading") or style in ("title", "subtitle") else "paragraph"
        if re.match(r"^(?:[-•*]|\d+[.)])\s+", text):
            kind = "list"
        blocks.append({"id": "", "kind": kind, "text": text, "page": 1,
                       "style": para.style.name, "meta": {}})

    # inline images (dimensions only; alt text from the drawing name where present)
    for rel in document.part.related_parts.values():
        if "image" not in getattr(rel, "content_type", ""):
            continue
        try:
            with Image.open(io.BytesIO(rel.blob)) as im:
                w, h = im.size
        except Exception:
            continue
        blocks.append({"id": "", "kind": "image", "text": f"[image {rel.partname}]", "page": 1,
                       "meta": {"width": w, "height": h, "alt": None}})
    for table in document.tables:
        rows = [" | ".join(c.text.strip() for c in row.cells) for row in table.rows]
        if rows:
            blocks.append({"id": "", "kind": "table", "text": "\n".join(rows), "page": 1, "meta": {}})
    return blocks, 1


def ocr_words(im, *, lang: str = "eng") -> dict:
    """OCR an image into words *with pixel boxes* and lines.

    `image_to_data` is used rather than `image_to_string` because a finding has to be
    able to point at the pixels it is talking about: the word box is what the reviewer
    sees highlighted. Returns ``{text, words, lines, mean_confidence}``; an image with
    no legible text returns an empty word list and no exception.
    """
    import pytesseract

    w, h = im.size
    data = pytesseract.image_to_data(im, lang=lang, output_type=pytesseract.Output.DICT)
    words: list[dict] = []
    lines: dict[tuple, dict] = {}
    confidences: list[float] = []
    for i, word in enumerate(data.get("text", [])):
        raw = (word or "").strip()
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = -1.0
        if not raw or conf < 0:
            continue  # tesseract reports -1 for non-text rows
        left, top = int(data["left"][i]), int(data["top"][i])
        width, height = int(data["width"][i]), int(data["height"][i])
        if width <= 0 or height <= 0:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        box = {"left": left, "top": top, "width": width, "height": height}
        entry = {
            "text": raw, "confidence": round(conf / 100.0, 3), **box,
            "bbox_norm": bbox_norm(box, w, h),
        }
        words.append(entry)
        confidences.append(entry["confidence"])
        line = lines.setdefault(key, {"words": [], "boxes": []})
        line["words"].append(raw)
        line["boxes"].append(box)

    out_lines = []
    for line in lines.values():
        box = union_box(line["boxes"])
        out_lines.append({
            "text": " ".join(line["words"]),
            "words": len(line["words"]),
            **box,
            "bbox_norm": bbox_norm(box, w, h),
        })
    out_lines.sort(key=lambda ln: (ln["top"], ln["left"]))
    return {
        "text": "\n".join(ln["text"] for ln in out_lines),
        "words": words,
        "lines": out_lines,
        "mean_confidence": (round(sum(confidences) / len(confidences), 3) if confidences else None),
    }


def union_box(boxes: list[dict]) -> dict:
    left = min(b["left"] for b in boxes)
    top = min(b["top"] for b in boxes)
    right = max(b["left"] + b["width"] for b in boxes)
    bottom = max(b["top"] + b["height"] for b in boxes)
    return {"left": left, "top": top, "width": right - left, "height": bottom - top}


def bbox_norm(box: dict, width: int, height: int) -> list[float]:
    """Box as [x0, y0, x1, y1] in 0..1, so a highlight can be drawn at any zoom."""
    if not width or not height:
        return [0.0, 0.0, 1.0, 1.0]
    return [
        round(max(0.0, box["left"] / width), 4),
        round(max(0.0, box["top"] / height), 4),
        round(min(1.0, (box["left"] + box["width"]) / width), 4),
        round(min(1.0, (box["top"] + box["height"]) / height), 4),
    ]


def extract_image(data: bytes, *, alt: str | None = None) -> tuple[list[dict], int]:
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        w, h = im.size
        fmt = im.format or "PNG"
        ocr = {"text": "", "words": [], "lines": [], "mean_confidence": None}
        if _ocr_available()[0]:
            try:
                ocr = ocr_words(im)
            except Exception:  # a missing language pack must not fail an upload
                ocr = {"text": "", "words": [], "lines": [], "mean_confidence": None}
    blocks: list[dict] = []
    if ocr["text"].strip():
        # The word boxes travel with the OCR text as well as with the image, so a finding
        # about a word read out of the picture can be pointed straight back at it.
        blocks.append({"id": "", "kind": "paragraph", "text": ocr["text"].strip(), "page": 1,
                       "meta": {"source": "ocr", "ocr_confidence": ocr["mean_confidence"],
                                "ocr_words": ocr["words"][:600], "ocr_lines": ocr["lines"][:200],
                                "image_width": w, "image_height": h}})
    blocks.append({
        "id": "", "kind": "image", "text": f"[uploaded image {w}×{h} {fmt}]", "page": 1,
        "meta": {"width": w, "height": h, "alt": alt, "format": fmt, "font": None,
                 # B1/B2: the text inside the pixels, and where each word sits, so a
                 # finding can highlight it instead of describing it.
                 "ocr": bool(ocr["text"].strip()),
                 "ocr_text": ocr["text"].strip()[:4000],
                 "ocr_words": ocr["words"][:600],
                 "ocr_lines": ocr["lines"][:200],
                 "ocr_confidence": ocr["mean_confidence"],
                 "bbox": [0.0, 0.0, 1.0, 1.0]},
    })
    return blocks, 1


@lru_cache
def _ocr_available() -> tuple[bool]:
    from ..config import settings
    if not settings.ocr_enabled:
        return (False,)
    try:
        import pytesseract  # noqa: F401
        pytesseract.get_tesseract_version()
        return (True,)
    except Exception:
        return (False,)


def measure(extracted: dict, data: bytes, *, palette: list[str] | None = None,
            allowed_ratios: dict | None = None, content_type: str | None = None,
            mime: str | None = None) -> dict:
    """Attach pixel measurements (B2) to image blocks, in place.

    A single uploaded image is measured from the upload bytes. For a PDF or DOCX the
    picture was extracted during parsing, so `_embedded_pixels` supplies the bytes for
    the blocks the extractor marked. Measurement failures are silent by design: a review
    must not fail because one image could not be decoded, and an unmeasured image simply
    carries no analysis block (so no pixel finding is invented for it).
    """
    from . import image_analysis
    from . import phash as phash_mod

    allowed = None
    if allowed_ratios and content_type:
        allowed = [float(r) for r in (allowed_ratios.get(content_type) or [])]
    blobs = _embedded_pixels(data, mime) if mime and not (mime or "").startswith("image/") else []
    image_index = 0
    for block in extracted.get("blocks") or []:
        if block.get("kind") != "image":
            continue
        blob = data if (mime or "").startswith("image/") else (
            blobs[image_index] if image_index < len(blobs) else b"")
        image_index += 1
        if not blob:
            continue
        meta = block.setdefault("meta", {})
        analysis = image_analysis.analyse_bytes(
            blob, palette=palette or [], allowed_ratios=allowed or [],
            ocr_words=meta.get("ocr_lines") or [])
        if analysis:
            meta["analysis"] = analysis
            meta["ocr_text"] = (meta.get("ocr_text") or analysis.get("ocr_text") or "")[:4000]
        # B5: hash PNG pixels only. A JPEG's low bits move with the encoder, and a
        # measurement that depends on the compressor is not a measurement.
        if blob.startswith(b"\x89PNG"):
            meta["phash"] = phash_mod.phash_bytes(blob)
    return extracted


def _embedded_pixels(data: bytes, mime: str) -> list[bytes]:
    """Raw bytes of each embedded raster image, in extraction order."""
    out: list[bytes] = []
    try:
        if mime == "application/pdf" or not mime:
            import fitz
            with fitz.open(stream=data, filetype="pdf") as doc:
                for page in doc:
                    for img in page.get_images(full=True):
                        try:
                            out.append(doc.extract_image(img[0])["image"])
                        except Exception:
                            out.append(b"")
        elif mime.endswith("wordprocessingml.document"):
            import docx
            document = docx.Document(io.BytesIO(data))
            for rel in document.part.related_parts.values():
                if "image" in getattr(rel, "content_type", ""):
                    out.append(rel.blob)
    except Exception:
        return out
    return out


def extract_upload(filename: str, mime: str, data: bytes, *, alt: str | None = None) -> dict:
    """Dispatch by MIME type; returns {blocks, pages, text, injection, kind}."""
    name = (filename or "").lower()
    if mime == "application/pdf" or name.endswith(".pdf"):
        blocks, pages = extract_pdf(data)
    elif mime.endswith("wordprocessingml.document") or name.endswith(".docx"):
        blocks, pages = extract_docx(data)
    elif mime.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".webp")):
        blocks, pages = extract_image(data, alt=alt)
    elif mime.startswith("text/") or name.endswith(".txt"):
        text = data.decode("utf-8", errors="replace")
        blocks, pages = text_to_blocks(text), 1
    else:
        raise ValueError(f"Unsupported file type: {mime or name}")
    text, blocks = blocks_to_text(blocks)
    return {"blocks": blocks, "pages": pages, "text": text,
            "injection": injection_scan(text), "tokens": estimate_tokens(text)}


def extract_pasted(text: str) -> dict:
    blocks = text_to_blocks(text)
    body, blocks = blocks_to_text(blocks)
    return {"blocks": blocks, "pages": 1, "text": body,
            "injection": injection_scan(body), "tokens": estimate_tokens(body)}
