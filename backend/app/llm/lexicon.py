"""Lexical configuration for the offline reviewers.

Everything that is *word knowledge* rather than *logic* lives here, so a reviewer's
behaviour can be reviewed and extended without touching control flow. The
generalisation pass (Round 3, A5) added the synonym sets, the inflection rules and
the pattern families below; no sample text was ever pasted in.

Three ideas do the work:

1. **Normalisation.** Copy arrives with zero-width spaces, non-breaking spaces and
   soft hyphens inside words. A reviewer that matches on the raw bytes misses
   "best in the world" when a CMS has inserted U+200B between the words. Every
   pattern here runs over a normalised view of the text and the match offsets are
   mapped back, so the finding still points at the original characters.

2. **Inflection.** "guaranteed" and "guarantees" are the same claim; "unrivalled"
   and "unrivalled" are the same puffery. Words are matched with a stem plus a
   small suffix set rather than as literal strings, which is why the lists below
   stay short.

3. **Pattern families.** A superlative is not a word, it is a shape — "the best",
   "the world's best", "nothing on the market comes close", "la meilleure du
   marché". Those shapes are regexes, listed once, applied by the legal reviewer.
"""
from __future__ import annotations

# Characters that render as nothing (or as a space) but break a literal match.
ZERO_WIDTH = "\u200b\u200c\u200d\u2060\ufeff\u00ad"
SPACE_LIKE = "\u00a0\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f"

# Suffixes a phrase-final word may carry and still mean the same thing.
INFLECTIONS = ("s", "es", "ed", "d", "ing", "ings", "ly")

# --------------------------------------------------------------------------- #
# Puffery / superiority
# --------------------------------------------------------------------------- #
# Words that assert a rank without evidence. Deliberately excludes "leading" and
# "top", which the brand-voice list already owns — a span should not be claimed by
# two reviewers, because the merge only de-duplicates inside one reviewer.
SUPERLATIVE_WORDS = (
    "best", "greatest", "finest", "cheapest", "fastest", "strongest",
    "unbeatable", "unsurpassed", "incomparable", "unrivalled", "unrivaled",
    "peerless", "matchless", "preeminent",
)

# Multi-word claims of superiority, as shapes rather than sentences.
SUPERLATIVE_PATTERNS: tuple[str, ...] = (
    # "the best", "the world's best", "the market's cheapest"
    r"\b(?:the\s+)?(?:world['’]?s?\s+|market['’]?s?\s+|industry['’]?s?\s+)?"
    r"(?:best|greatest|finest|cheapest|fastest|strongest)\b",
    # "nothing on the market comes close", "nothing else compares"
    r"\bnothing\s+(?:(?:on|in)\s+the\s+market\s+|elsewhere\s+|else\s+)?"
    r"(?:comes\s+close|compares|matches|beats|is\s+close)\b",
    r"\b(?:no\s+one|nobody|none)\s+(?:else\s+)?(?:comes\s+close|compares|does\s+it\s+better)\b",
    r"\bsecond\s+to\s+none\b",
    r"\bwithout\s+(?:equal|peer)\b",
    r"\b(?:outclassed|outperforms?)\s+every\b",
)

# The same claim in the languages this demo workspace writes in. Kept short on
# purpose: a false accusation is worse than a miss.
MULTILINGUAL_SUPERLATIVE_PATTERNS: tuple[str, ...] = (
    r"\b(?:la|le)\s+meilleur(?:e)?(?:\s+du\s+march[ée]|\s+sur\s+le\s+march[ée])?\b",
    r"\bel\s+mejor\b|\bla\s+mejor\b",
    r"\bder\s+best(?:e|en)?\b|\bdie\s+best(?:e|en)?\b",
    r"\bil\s+migliore\b|\bla\s+migliore\b",
)

# --------------------------------------------------------------------------- #
# Guarantees and absolutes
# --------------------------------------------------------------------------- #
GUARANTEE_PATTERNS: tuple[str, ...] = (
    # "guarantee/guaranteed/guarantees/guaranteeing"
    r"\bguarantee(?:s|d|ing)?\b",
    # "we promise every forecast will land within…"
    r"\bpromise[sd]?\b[^.!?\n]{0,80}\b(?:every|all|always|will|exactly|within)\b",
    # "100% guaranteed", "fully safe", "completely accurate"
    r"\b(?:100\s?%|fully|completely|totally)\s+(?:guaranteed|safe|secure|accurate|protected|reliable)\b",
    r"\bnever\s+(?:fails?|goes\s+wrong|drops?|breaks?|misses)\b",
    r"\b(?:zero|no)\s+(?:risk|downtime|errors?|chance\s+of\s+failure)\b",
)

# Claims that a whole population is covered — an absolute, not a measurement.
ABSOLUTE_PATTERNS: tuple[str, ...] = (
    r"\b(?:every|all)\s+(?:regulator|regulators|customer|customers|client|clients|"
    r"market|markets|business|businesses)\b",
    r"\b(?:everyone|everybody|nobody)\b",
    r"\bapproved\s+by\s+every\b",
)

# --------------------------------------------------------------------------- #
# Value claims that read as discount language in premium copy
# --------------------------------------------------------------------------- #
# Not a superlative: a price framing. "cheap" is in the seed Brand Kit's banned
# term list, so this is the reviewer's fallback when a workspace has not written
# that term yet — the same shape, not a copy of the sample.
VALUE_FRAMING_PATTERNS: tuple[str, ...] = (
    r"\bcosts?\s+(?:less|nothing)\s+than\b",
    r"\bcheaper\s+than\b",
    r"\bfor\s+the\s+price\s+of\b",
)
