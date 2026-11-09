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
def extract_pdf(data: bytes) -> tuple[list[dict], int]:
    import fitz  # PyMuPDF

    blocks: list[dict] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for pno, page in enumerate(doc, start=1):
            for b in page.get_text("blocks"):
                x0, y0, x1, y1, text, _bno, btype = b
                clean = (text or "").strip()
                if btype == 0 and clean:
                    blocks.append({"id": "", "kind": "paragraph", "text": clean, "page": pno, "meta": {}})
            for img_index, img in enumerate(page.get_images(full=True)):
                try:
                    pix = doc.extract_image(img[0])
                    with Image.open(io.BytesIO(pix["image"])) as im:
                        w, h = im.size
                except Exception:
                    w, h = img[2], img[3]
                blocks.append({
                    "id": "", "kind": "image", "text": f"[image {img_index + 1} on page {pno}]",
                    "page": pno, "meta": {"width": w, "height": h, "page": pno},
                })
            if not any(b["page"] == pno for b in blocks):
                blocks.append({"id": "", "kind": "paragraph", "text": f"[page {pno}: no extractable text]",
                               "page": pno, "meta": {"empty": True}})
        pages = doc.page_count
    return blocks, pages


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


def extract_image(data: bytes, *, alt: str | None = None) -> tuple[list[dict], int]:
    with Image.open(io.BytesIO(data)) as im:
        w, h = im.size
        fmt = im.format or "PNG"
        text = ""
        if _ocr_available()[0]:
            try:
                import pytesseract
                text = pytesseract.image_to_string(im) or ""
            except Exception:
                text = ""
    blocks: list[dict] = []
    if text.strip():
        blocks.append({"id": "", "kind": "paragraph", "text": text.strip(), "page": 1,
                       "meta": {"source": "ocr"}})
    blocks.append({
        "id": "", "kind": "image", "text": f"[uploaded image {w}×{h} {fmt}]", "page": 1,
        "meta": {"width": w, "height": h, "alt": alt, "format": fmt, "ocr": bool(text.strip()),
                 "font": None},
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
