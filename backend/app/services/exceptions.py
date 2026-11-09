"""Manager-approved exceptions — how Sentinel actually learns.

A manager dismissing a finding is a signal, not a rule. When they answer *"Make this an
approved rule? Yes"* the decision becomes a **new rule version** that says, in words a
human can audit, that a specific wording is permitted in a specific scope:

    Exception: “cheap” is permitted in content type "ad".
    Manager reason: price-led paid social.

Later reviews get these exceptions in their `ReviewContext` (already filtered by the
content's type and department), so the same span is no longer flagged there — while a
blog post still is. Nothing is deleted: the original rule version stays, and the
exception can be reverted like any other rule.
"""
from __future__ import annotations

import re

EXCEPTION_RE = re.compile(r"Exception[^:\n]{0,80}:\s*[“\"']([^”\"']{1,160})[”\"']", re.I)


def exception_value(body: str | None) -> str | None:
    """The permitted wording named by an exception rule body, if it is one."""
    if not body:
        return None
    m = EXCEPTION_RE.search(body)
    return m.group(1).strip() if m else None


def is_exception(body: str | None) -> bool:
    return exception_value(body) is not None


def exception_body(span_text: str, scope_label: str, reason: str | None,
                   author_name: str | None = None) -> str:
    """Human-readable rule text for a promoted exception."""
    quoted = (span_text or "").strip()[:160]
    line = f'Exception: “{quoted}” is permitted in {scope_label}.'
    if reason:
        line += f" Manager reason: {reason.strip()[:400]}"
    if author_name:
        line += f" Approved by {author_name}."
    return line


def scope_label(*, content_type: str | None, department: str | None) -> str:
    if content_type:
        return f'content type "{content_type}"'
    if department:
        return f'department "{department}"'
    return "all content (organisation-wide)"
