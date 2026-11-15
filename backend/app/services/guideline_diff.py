"""Sectioning and diffing for brand guidelines (C1).

A guideline is a set of sections with rules hanging off them. When a new version
arrives, the question a brand manager actually has is *"which sections changed, and
which of my rules are now standing on text that no longer says that?"* — not "what
is the character diff for this file".

`retrieval.heading_before` only recognised numbered headings ("3.2 Tone"). This
module recognises the three shapes guidelines really arrive in:

* numbered headings — "2. Brand Voice", "2.1 Tone of voice", "(3) Colour"
* markdown headings — "## Brand Voice", "### 2.1 Tone"
* DOCX heading blocks — `kind == "heading"` in the extracted block list

Sections are matched across versions by *normalised title* first (case, punctuation,
numbering and "the/a" removed), so renumbering a document does not turn every
section into an add plus a delete. When titles do not match but a section is
plausibly the same one renamed, the body similarity is reported instead of guessed
at: a rename shows up as `added` + `removed` with a `similar_to` hint, which is
honest about what the tool can and cannot know.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher

# "1. Brand Voice", "2.1 Tone", "(3) Colour", "3) Legal"
NUMBERED = re.compile(r"^\s*(?:\((\d{1,2})\)|(\d{1,2})(?:\.(\d{1,2}))?[.)])\s+(\S.{0,120})$")
# "## Heading", "### 2.1 Heading"
MARKDOWN = re.compile(r"^\s{0,3}(#{1,6})\s+(\S.{0,120})$")
# A short line that is a heading by shape: no full stop, few words, title-ish
SHOUTY = re.compile(r"^\s*([A-Z][A-Za-z0-9 &/'’\-]{2,60})\s*$")


@dataclass
class Section:
    title: str
    body: str
    level: int = 1
    start: int = 0
    end: int = 0

    @property
    def key(self) -> str:
        return normalise_title(self.title)


def normalise_title(title: str) -> str:
    """Comparison key for a heading: numbering, case, punctuation and articles gone."""
    text = (title or "").strip().lower()
    text = re.sub(r"^\(?\d{1,2}(?:\.\d{1,2})?[.)]?\s*", "", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    text = re.sub(r"\b(?:the|a|an)\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def split_sections(text: str, blocks: list[dict] | None = None) -> list[Section]:
    """Sections in document order. Falls back to one section when there are no headings."""
    text = text or ""
    headings: list[tuple[int, int, str, int]] = []  # (char_start, char_end_of_line, title, level)

    # DOCX: the extractor already told us which blocks are headings.
    if blocks:
        cursor = 0
        for block in blocks:
            raw = (block.get("text") or "").strip()
            if block.get("kind") == "heading" and raw:
                headings.append((cursor, cursor + len(raw), raw, 1))
            cursor += len(raw) + 2  # blocks_to_text joins with a blank line

    if not headings:
        offset = 0
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped:
                md = MARKDOWN.match(line)
                numbered = NUMBERED.match(line)
                if md:
                    headings.append((offset, offset + len(line), md.group(2).strip(), len(md.group(1))))
                elif numbered:
                    headings.append((offset, offset + len(line), numbered.group(4).strip(), 1))
                elif len(stripped) < 60 and SHOUTY.match(line) and not stripped.endswith("."):
                    headings.append((offset, offset + len(line), stripped, 1))
            offset += len(line) + 1

    if not headings:
        return [Section(title="(document)", body=text.strip(), start=0, end=len(text))]

    sections: list[Section] = []
    for index, (start, head_end, title, level) in enumerate(headings):
        body_start = head_end
        body_end = headings[index + 1][0] if index + 1 < len(headings) else len(text)
        sections.append(Section(title=title, body=text[body_start:body_end].strip(),
                                level=level, start=start, end=body_end))
    return sections


def similarity(a: str, b: str) -> float:
    """0..1 on whitespace-normalised text, so a reflow does not read as a rewrite."""
    norm = lambda s: re.sub(r"\s+", " ", (s or "")).strip().lower()
    return round(SequenceMatcher(None, norm(a), norm(b)).ratio(), 3)


@dataclass
class SectionChange:
    status: str                 # added | removed | changed | unchanged
    title: str
    previous_title: str | None = None
    similarity: float = 1.0
    body: str = ""
    previous_body: str = ""
    similar_to: str | None = None   # a removed/added pair with no title match
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "status": self.status, "title": self.title, "previous_title": self.previous_title,
            "similarity": self.similarity, "body": self.body, "previous_body": self.previous_body,
            "similar_to": self.similar_to, "notes": self.notes,
        }


CHANGED_THRESHOLD = 0.985   # below this, a same-titled section's text really moved


def diff_sections(old: list[Section], new: list[Section]) -> list[SectionChange]:
    """added / removed / changed / unchanged, matched on the normalised title first."""
    old_by_key: dict[str, Section] = {}
    for section in old:
        old_by_key.setdefault(section.key, section)
    new_by_key: dict[str, Section] = {}
    for section in new:
        new_by_key.setdefault(section.key, section)

    changes: list[SectionChange] = []
    matched_old: set[str] = set()

    for section in new:
        previous = old_by_key.get(section.key)
        if previous is None:
            changes.append(SectionChange(status="added", title=section.title, body=section.body,
                                         similarity=0.0))
            continue
        matched_old.add(section.key)
        score = similarity(previous.body, section.body)
        status = "unchanged" if score >= CHANGED_THRESHOLD else "changed"
        notes = []
        if previous.title.strip() != section.title.strip():
            notes.append(f"Retitled from “{previous.title}”.")
        changes.append(SectionChange(status=status, title=section.title,
                                     previous_title=previous.title, similarity=score,
                                     body=section.body, previous_body=previous.body, notes=notes))

    for section in old:
        if section.key in matched_old:
            continue
        # Was it renamed rather than deleted? Say so, but keep the status honest.
        best, best_score = None, 0.0
        for candidate in [c for c in changes if c.status == "added"]:
            score = similarity(section.body, candidate.body)
            if score > best_score:
                best, best_score = candidate, score
        if best is not None and best_score >= 0.6:
            best.similar_to = section.title
            best.notes.append(
                f"Body is {best_score:.0%} similar to the removed section “{section.title}”; "
                f"treat this as a rename until a human says otherwise.")
        changes.append(SectionChange(status="removed", title=section.title,
                                     body=section.body, similarity=0.0))
    return changes


def diff_documents(old_text: str, new_text: str,
                   old_blocks: list[dict] | None = None,
                   new_blocks: list[dict] | None = None) -> list[SectionChange]:
    return diff_sections(split_sections(old_text, old_blocks), split_sections(new_text, new_blocks))


def summarise(changes: list[SectionChange]) -> dict:
    counts: dict[str, int] = {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}
    for change in changes:
        counts[change.status] = counts.get(change.status, 0) + 1
    return counts
