"""Typed domain errors that the API turns into specific HTTP responses.

`RuntimeError` is the wrong shape for "this organisation has no Brand Kit yet": it is not
a bug, it is a state a brand-new workspace is legitimately in, and the browser needs to
tell the two apart so it can offer the fix instead of an apology. A named exception is
also the only way a caller can *catch* the condition — `except RuntimeError` would swallow
every unrelated crash in the same block.
"""
from __future__ import annotations


class NoBrandKitError(RuntimeError):
    """The organisation has no Brand Kit row at all.

    Raised by `pipeline.active_brand_kit()` when a caller asks for a kit that must exist
    and there is none. Mapped to HTTP 409 with `code: "no_brand_kit"` (see `app/main.py`),
    so the UI can show a calm empty state with a button to /kit rather than a raw error.
    """

    code = "no_brand_kit"

    def __init__(self, message: str | None = None):
        super().__init__(
            message
            or "This workspace has no Brand Kit yet. Create one (or load the sample kit) "
               "and run the review again."
        )
