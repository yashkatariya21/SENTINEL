"""Provider-agnostic AI adapter contract.

Every AI call in Sentinel goes through `LLMAdapter`, server-side only. Two
implementations ship:

* `LocalEngine`  - deterministic, offline, zero cost (default). Reviewers are
  implemented as transparent heuristics over the Brand Kit, so the product is
  fully demonstrable with no keys and no third-party spend.
* `HostedLLM`    - any OpenAI-compatible or Anthropic chat endpoint, or a
  Supabase-hosted model gateway. Validated with the same Pydantic schema.

Neither adapter ever sees an API key from the browser.
"""
from __future__ import annotations

import hashlib
import math
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Iterable

from ..schemas import ReviewerName, ReviewerOutput


@dataclass
class ReviewContext:
    text: str
    blocks: list[dict] = field(default_factory=list)
    content_type: str = "blog"
    department: str | None = None
    rules: list[dict] = field(default_factory=list)          # active rule versions in scope
    terms: list[dict] = field(default_factory=list)          # confirmed terms
    facts: list[dict] = field(default_factory=list)          # confirmed approved facts
    evidence: list[dict] = field(default_factory=list)       # retrieved brand-kit chunks
    brand: dict = field(default_factory=dict)                # colours / fonts / logos
    deterministic_spans: list[tuple[int, int]] = field(default_factory=list)
    exceptions: list[dict] = field(default_factory=list)     # manager-approved carve-outs in scope

    def exempt(self, span_text: str, category: str | None = None) -> dict | None:
        """Return the manager-approved exception covering this span, if one is in scope.

        Exceptions are how Sentinel learns: a manager dismissal that they promote to a
        rule becomes a carve-out that later reviews must honour — but only within the
        scope they chose (one department, one content type, or everywhere).
        """
        needle = (span_text or "").strip().lower()
        if not needle:
            return None
        for ex in self.exceptions:
            if category and ex.get("category") and ex["category"] != category:
                continue
            value = (ex.get("value") or "").strip().lower()
            if value and (value == needle or value in needle or needle in value):
                return ex
        return None

    def rules_for(self, category: str) -> list[dict]:
        return [r for r in self.rules if r.get("category") == category]

    def rule(self, category: str, *keywords: str) -> dict | None:
        """Pick the most specific in-scope rule for a category / keyword hint."""
        candidates = self.rules_for(category)
        for kw in keywords:
            kw = kw.lower()
            for r in candidates:
                hay = f"{r.get('title','')} {r.get('body','')} {r.get('key','')}".lower()
                if kw in hay:
                    return r
        return candidates[0] if candidates else None

    def evidence_for(self, query: str, limit: int = 2) -> list[dict]:
        """Rank retrieved chunks against a query string (lexical + vector score)."""
        q = _tokens(query)
        scored = []
        for ev in self.evidence:
            t = _tokens(ev.get("text", ""))
            if not t:
                continue
            overlap = len(q & t) / max(1, len(q))
            score = 0.65 * overlap + 0.35 * float(ev.get("score", 0.0))
            if score > 0:
                scored.append((score, ev))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [ev for _, ev in scored[:limit]]


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2}


class LLMAdapter(ABC):
    provider_name: str = "local"
    model_name: str = "sentinel-local-1"
    embedding_model: str = "sentinel-hash-embed-1"
    embedding_dim: int = 256

    # -- embeddings --------------------------------------------------------
    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        ...

    # -- reviewer call -----------------------------------------------------
    @abstractmethod
    def review(self, reviewer: ReviewerName, ctx: ReviewContext, *, temperature: float = 0.0) -> ReviewerOutput:
        """Return strict, Pydantic-validated findings for one reviewer."""

    # -- brand-kit ingestion ----------------------------------------------
    @abstractmethod
    def propose_rules(self, text: str, meta: dict) -> dict:
        """Propose {rules: [...], terms: [...], facts: [...]} for Admin confirmation."""

    # -- fact extraction (used by the fact checker) ------------------------
    def extract_claims(self, text: str) -> list[dict]:
        return extract_claims(text)


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #
_STOP = {
    "the", "and", "for", "with", "that", "this", "from", "your", "you", "our", "are", "was", "were",
    "will", "have", "has", "not", "but", "all", "any", "can", "may", "must", "should", "into", "than",
    "then", "they", "them", "their", "its", "it's", "we're", "we", "us", "a", "an", "of", "to", "in",
    "on", "is", "be", "as", "at", "or", "by", "if", "so", "do", "does", "did", "more", "most", "when",
}

_CLAIM_PATTERNS = [
    (r"\d+(?:\.\d+)?\s?%", "percentage"),
    (r"[£$€]\s?\d[\d,\.]*", "amount"),
    (r"\b\d+(?:\.\d+)?\s?(?:days?|hours?|minutes?|weeks?|months?|years?)\b", "duration"),
    (r"\bguarantee[ds]?\b", "guarantee"),
    (r"\brisk[- ]free\b", "guarantee"),
    (r"\bno (?:hidden )?fees?\b", "fees"),
    (r"\b(?:always|never|everyone|every customer|nobody)\b", "absolute"),
    (r"\b(?:fscs|fca|pci|iso)\b", "regulatory"),
    (r"\baward[- ]winning\b", "award"),
    (r"\b(?:number one|#1|best|leading|top)\b", "superlative"),
]


# Split on newlines, or on sentence-ending punctuation followed by a space and a
# capital/digit. This keeps decimals ("94.2%") and version numbers intact.
_SENTENCE_BREAK = re.compile(r"\n+|(?<=[.!?])\s+(?=[\"'(\[]?[A-Z0-9])")


def split_sentences(text: str) -> list[tuple[int, int, str]]:
    """[(start, end, sentence)] with offsets that survive decimals and abbreviations."""
    text = text or ""
    out: list[tuple[int, int, str]] = []
    pos = 0
    for m in _SENTENCE_BREAK.finditer(text):
        chunk = text[pos:m.start()]
        lead = len(chunk) - len(chunk.lstrip())
        stripped = chunk.strip()
        if stripped:
            out.append((pos + lead, pos + lead + len(stripped), stripped))
        pos = m.end()
    tail = text[pos:]
    lead = len(tail) - len(tail.lstrip())
    if tail.strip():
        out.append((pos + lead, pos + lead + len(tail.strip()), tail.strip()))
    return out


def extract_claims(text: str) -> list[dict]:
    """Deterministic claim extraction — the input to the fact checker."""
    claims: list[dict] = []
    for start, end, sentence in split_sentences(text):
        if len(sentence) < 8:
            continue
        kinds = [kind for pat, kind in _CLAIM_PATTERNS if re.search(pat, sentence, re.I)]
        if not kinds:
            continue
        numbers = re.findall(r"\d+(?:[\.,]\d+)?", sentence)
        claims.append({
            "text": sentence,
            "start": start,
            "end": end,
            "kinds": sorted(set(kinds)),
            "numbers": numbers,
            "keywords": sorted(_tokens(sentence) - _STOP)[:12],
        })
    return claims


def hashed_embedding(text: str, dim: int = 256) -> list[float]:
    """Deterministic hashed bag-of-words embedding (offline fallback).

    Not a semantic model - it is a stable lexical vector so retrieval, scoring and
    tests behave identically with no network. Hosted providers replace it with
    real embeddings of the same dimensionality per config.
    """
    vec = [0.0] * dim
    toks = [t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if t not in _STOP]
    for tok in toks:
        h = int(hashlib.sha256(tok.encode()).hexdigest()[:8], 16)
        vec[h % dim] += 1.0
        # character trigrams give partial robustness to morphology
        for i in range(len(tok) - 2):
            tri = tok[i:i + 3]
            h2 = int(hashlib.sha256(tri.encode()).hexdigest()[:8], 16)
            vec[h2 % dim] += 0.25
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 6) for v in vec]


def cosine(a: Iterable[float], b: Iterable[float]) -> float:
    a, b = list(a), list(b)
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)
