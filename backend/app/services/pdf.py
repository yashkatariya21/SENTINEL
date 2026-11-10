"""Server-side PDF export of a review record.

The reviewer's artefact has to survive leaving the app: a PDF states the same facts
as the screen (rule, citation, confidence, who decided what) and prints the
disclaimer on every page. Generated with reportlab so no headless browser and no
system libraries are required.
"""
from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

CONTENT_WIDTH = A4[0] - 36 * mm  # page width minus the 18 mm margins

NAVY = colors.HexColor("#0B1437")
GOLD = colors.HexColor("#C9A227")
INK = colors.HexColor("#14192E")
MUTED = colors.HexColor("#5B6275")
IVORY = colors.HexColor("#FBF7EE")
CRITICAL = colors.HexColor("#9B1C31")
POSSIBLE = colors.HexColor("#B26A00")
CONFIRMED = colors.HexColor("#1F6F4A")

SEVERITY_LABEL = {
    "critical": "CRITICAL", "high": "HIGH", "medium": "MEDIUM", "low": "LOW",
}
DISCLAIMER = (
    "Sentinel AI reviews and explains. It never publishes, never auto-fixes, never changes a rule "
    "without a manager's click. Not legal advice."
)


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=base["Title"], fontName="Times-Bold", fontSize=20,
                                textColor=NAVY, spaceAfter=2, alignment=0),
        "eyebrow": ParagraphStyle("e", parent=base["Normal"], fontName="Helvetica", fontSize=7.5,
                                  textColor=GOLD, spaceAfter=6, leading=10),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Times-Bold", fontSize=12,
                             textColor=NAVY, spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("b", parent=base["Normal"], fontName="Helvetica", fontSize=9,
                               textColor=INK, leading=13),
        "small": ParagraphStyle("s", parent=base["Normal"], fontName="Helvetica", fontSize=7.5,
                                textColor=MUTED, leading=10),
        "quote": ParagraphStyle("q", parent=base["Normal"], fontName="Times-Italic", fontSize=9,
                                textColor=INK, leading=12),
        "mono": ParagraphStyle("m", parent=base["Normal"], fontName="Courier", fontSize=7,
                               textColor=MUTED, leading=9),
    }


def _quote(text: str, style: ParagraphStyle, width: float) -> Table:
    """A borderless one-cell table: a gold rule on the left, ivory behind, nothing overlapped."""
    cell = Table([[Paragraph(text, style)]], colWidths=[width])
    cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), IVORY),
        ("LINEBEFORE", (0, 0), (0, -1), 2, GOLD),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return cell


def _footer(canvas, doc) -> None:
    canvas.saveState()
    width, _ = A4
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.6)
    canvas.line(18 * mm, 16 * mm, width - 18 * mm, 16 * mm)
    canvas.setFont("Helvetica", 6.4)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 11.5 * mm, DISCLAIMER)
    canvas.drawRightString(width - 18 * mm, 11.5 * mm, f"page {doc.page}")
    canvas.restoreState()


def review_pdf(*, item: dict, run: dict, findings: list[dict], organisation: str) -> bytes:
    """Return the review record as PDF bytes. `findings` are plain dicts (schema dumps)."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, title=f"Review record — {item.get('title', '')}",
        author="Sentinel AI", subject="Pre-publication brand review",
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=22 * mm,
    )
    s = _styles()
    story: list = []

    story.append(Paragraph(f"SENTINEL AI · REVIEW RECORD · {organisation.upper()}", s["eyebrow"]))
    story.append(Paragraph(item.get("title") or "Untitled submission", s["title"]))
    story.append(HRFlowable(width="100%", thickness=1.2, color=GOLD, spaceBefore=2, spaceAfter=6))

    meta = [
        ["Owner", item.get("owner_name") or "—", "Department", item.get("department") or "—"],
        ["Content type", (item.get("content_type") or "—").replace("_", " "),
         "Version", str(item.get("current_version") or "—")],
        ["Status", (item.get("status") or "—").replace("_", " "),
         "Findings", str(len(findings))],
        ["Model", run.get("model_name") or "—", "Prompt", run.get("prompt_version") or "—"],
    ]
    table = Table(meta, colWidths=[26 * mm, 60 * mm, 26 * mm, 60 * mm])
    table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED), ("TEXTCOLOR", (2, 0), (2, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), INK), ("TEXTCOLOR", (3, 0), (3, -1), INK),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#E3D9C4")),
    ]))
    story.append(table)

    story.append(Paragraph("Submitted content", s["h2"]))
    body = (item.get("body_text") or "").strip() or "(no text)"
    story.append(Paragraph(body.replace("\n", "<br/>"), s["body"]))

    story.append(Paragraph("Findings", s["h2"]))
    if not findings:
        story.append(Paragraph(
            "No findings. Every reviewer checked this content against the Brand Kit and the "
            "deterministic rules passed.", s["body"]))
    for index, f in enumerate(findings, start=1):
        label = "CONFIRMED" if f.get("label") == "confirmed" else "POSSIBLE"
        header = (
            f"<b>#{index} · {str(f.get('reviewer', '')).replace('_', ' ').upper()}</b> &nbsp;"
            f"<font color='{_hex(CRITICAL if f.get('severity') in ('critical', 'high') else POSSIBLE)}'>"
            f"{SEVERITY_LABEL.get(f.get('severity'), str(f.get('severity', '')).upper())}</font> &nbsp;"
            f"<font color='{_hex(CONFIRMED if label == 'CONFIRMED' else POSSIBLE)}'>{label}</font> &nbsp;"
            f"<font color='#5B6275'>confidence {round(float(f.get('confidence') or 0) * 100)}%</font>"
        )
        block = [Paragraph(header, s["small"]),
                 Paragraph(f"<b>{_esc(f.get('issue'))}</b>", s["body"]),
                 Spacer(1, 3)]
        block.append(Paragraph(f"<b>Why.</b> {_esc(f.get('why'))}", s["body"]))
        if f.get("rule_quote"):
            block.append(_quote(
                f"“{_esc(f.get('rule_quote'))}” — <b>{_esc(f.get('rule_key'))} "
                f"v{f.get('rule_version') or 1}</b>", s["quote"], CONTENT_WIDTH))
            block.append(Spacer(1, 3))
        else:
            block.append(Paragraph("No approved source found for this finding.", s["small"]))
        evidence = f.get("evidence") or {}
        if evidence:
            where = ", ".join(str(x) for x in [
                evidence.get("document"),
                f"page {evidence.get('page')}" if evidence.get("page") else None,
                evidence.get("section"),
            ] if x)
            block.append(Paragraph(f"<b>Citation.</b> {_esc(where)}", s["small"]))
            if evidence.get("snippet"):
                block.append(_quote(f"“{_esc(evidence.get('snippet'))}”", s["quote"], CONTENT_WIDTH))
                block.append(Spacer(1, 3))
        else:
            block.append(Paragraph("<b>Citation.</b> No approved source found — none was invented.",
                                   s["small"]))
        if f.get("impact"):
            block.append(Paragraph(f"<b>Impact.</b> {_esc(f.get('impact'))}", s["body"]))
        if f.get("suggestion"):
            block.append(Paragraph(
                f"<b>Suggestion.</b> Flagged: {_esc(f.get('span_text'))} → Becomes: "
                f"{_esc(f.get('suggestion'))}", s["body"]))
        block.append(Paragraph(
            f"Decision: {_esc(f.get('decision_status'))}"
            + (" · human review required" if f.get("human_review_required") else "")
            + f" · {_esc(f.get('provider'))}/{_esc(f.get('model'))}"
            + (f" · {round(f['metrics']['latency_ms'])} ms"
               if (f.get("metrics") or {}).get("latency_ms") else ""),
            s["mono"]))
        block.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#E3D9C4"),
                                spaceBefore=6, spaceAfter=6))
        story.append(KeepTogether(block))

    story.append(Spacer(1, 8))
    story.append(Paragraph("What this review did not do", s["h2"]))
    for line in (
        "It did not publish or schedule anything.",
        "It did not edit the content — suggestions are proposals only.",
        "It did not change a rule; a manager answers the learning prompt first.",
        "It did not invent citations: findings without a source say “No approved source found”.",
    ):
        story.append(Paragraph(f"• {line}", s["body"]))

    telemetry = run.get("metrics") or {}
    story.append(Paragraph("How this record was produced", s["h2"]))
    story.append(Paragraph(
        f"Provider {run.get('model_provider') or '—'} · model {run.get('model_name') or '—'} · "
        f"embedding {run.get('embedding_model') or '—'} · prompt {run.get('prompt_version') or '—'} · "
        f"{run.get('repeat_runs') or 1} repeat runs"
        + (f" · run measured at {telemetry.get('wall_ms')} ms" if telemetry.get("wall_ms") else "")
        + (f" · {telemetry.get('prompt_tokens')} prompt + {telemetry.get('completion_tokens')} "
           f"completion tokens" if telemetry.get("prompt_tokens") else "")
        + (f" · estimated cost ${telemetry.get('cost_usd_estimate')}" if telemetry.get("cost_usd_estimate") else ""),
        s["small"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}. This PDF is a record of "
        f"a review, not an approval.", s["small"]))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()


def _esc(value) -> str:
    text = "" if value is None else str(value)
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _hex(color) -> str:
    return "#%02X%02X%02X" % (int(color.red * 255), int(color.green * 255), int(color.blue * 255))
