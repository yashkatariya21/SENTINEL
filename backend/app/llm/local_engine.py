"""Local (offline) reviewer engine.

Six specialists, one job each, all emitting the same strict JSON contract. Every
finding must point at a Brand Kit rule + retrieved evidence chunk, or explicitly
carry `evidence_ref=None` so the UI can say "No approved source found". Nothing
here invents a citation.

Sampling note: `temperature` (passed as run index) intentionally drops weak
"possible" findings on some repeats, which is what makes the cross-run
agreement signal in the confidence formula meaningful. Deterministic and
direct-contradiction findings are always emitted.
"""
from __future__ import annotations

import random
import re

from ..schemas import ReviewerFinding, ReviewerName, ReviewerOutput
from .base import LLMAdapter, ReviewContext, extract_claims, hashed_embedding

SEV_ORDER = {"low": 1, "medium": 2, "high": 3, "critical": 4}

HYPE = [
    "revolutionary", "game-changing", "game changing", "world-class", "best-in-class", "cutting-edge",
    "unleash", "supercharge", "effortless", "seamless", "disrupt", "next-level",
    "amazing", "insane", "mind-blowing", "unparalleled", "industry-leading", "unrivalled", "unstoppable",
    "10x", "ninja", "rockstar", "paradigm shift", "bleeding edge", "one-stop shop", "ultimate",
]
COLLOQUIAL = ["gonna", "ain't", "yeah", "kinda", "sorta", "hey guys", "folks", "awesome sauce", "lol"]
PLAIN_ENGLISH = {
    "utilize": "use", "utilise": "use", "leverage": "use", "synergy": "teamwork", "facilitate": "help",
    "commence": "start", "terminate": "end", "endeavour": "try", "endeavor": "try", "prior to": "before",
    "in order to": "to", "in the event that": "if", "at this point in time": "now", "purchase": "buy",
    "assist": "help", "numerous": "many", "additional": "extra", "approximately": "about",
    "demonstrate": "show", "implement": "set up", "optimal": "best", "functionality": "features",
    "onboarding journey": "setup", "reach out": "contact", "circle back": "follow up",
}
RISKY_LEGAL = {
    "guaranteed results": ("critical", "An absolute performance promise cannot be substantiated."),
    "guaranteed": ("high", "A guarantee creates a contractual promise the business must honour."),
    "100% safe": ("critical", "Absolute safety claims are treated as misleading advertising."),
    "risk-free": ("high", "Risk-free claims need documented substantiation."),
    "risk free": ("high", "Risk-free claims need documented substantiation."),
    "no risk": ("high", "Removing all risk is a regulated claim."),
    "best company": ("high", "Superiority claims require comparative evidence held on file."),
    "best in the market": ("high", "Superiority claims require comparative evidence held on file."),
    "number one": ("high", "Ranking claims require a dated, verifiable source."),
    "no hidden fees": ("medium", "Fee claims should match the approved fee schedule."),
    "instant approval": ("medium", "Speed claims need to match operational reality."),
    "everyone qualifies": ("high", "Eligibility claims risk misrepresenting the product."),
    "approved by": ("medium", "Third-party endorsement claims need written permission on file."),
    "cure": ("critical", "Health outcome claims are regulated."),
    "clinically proven": ("critical", "Clinical claims require a cited study."),
    "doctor recommended": ("high", "Professional endorsement claims require evidence."),
    "fca regulated": ("high", "Regulatory status claims must match the register."),
    "fdic insured": ("high", "Deposit protection claims must match the scheme."),
}
SMALL_TEXT_RE = re.compile(r"\b(\d{1,2}(?:\.\d)?)\s?(?:pt|px)\b", re.I)
EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF]")


# --------------------------------------------------------------------------- #
def _specific_rule(ctx: "ReviewContext", category: str, keywords: tuple[str, ...],
                   fallback: dict | None) -> dict | None:
    """Cite the rule that actually mentions this issue, not just any rule in the category.

    ``ReviewContext.rule()`` falls back to the first rule of a category, which produced
    mismatched citations (an ALL-CAPS finding quoting the contrast rule). Here we only
    accept a rule whose text mentions the keyword, and otherwise fall back to the
    caller's broader rule so a finding is never left without a citation.
    """
    for kw in keywords:
        for r in ctx.rules_for(category):
            hay = f"{r.get('title', '')} {r.get('body', '')} {r.get('key', '')}".lower()
            if kw.lower() in hay:
                return r
    return fallback


class LocalEngine(LLMAdapter):
    provider_name = "local"
    model_name = "sentinel-local-1"
    embedding_model = "sentinel-hash-embed-1"
    embedding_dim = 256

    # ------------------------------------------------------------------ #
    def embed(self, texts: list[str]) -> list[list[float]]:
        return [hashed_embedding(t, self.embedding_dim) for t in texts]

    def review(self, reviewer: ReviewerName, ctx: ReviewContext, *, temperature: float = 0.0) -> ReviewerOutput:
        fn = {
            "brand_voice": self._brand_voice,
            "terminology": self._terminology,
            "fact_checker": self._fact_checker,
            "visual": self._visual,
            "accessibility": self._accessibility,
            "legal": self._legal,
        }[reviewer]
        raw = fn(ctx)
        rng = random.Random(f"{reviewer}:{temperature}")

        kept: list[ReviewerFinding] = []
        for item in raw:
            strong = item["deterministic"] or item["direct_contradiction"] or item["evidence_strength"] >= 0.6
            if strong:
                kept.append(ReviewerFinding(**item))
                continue
            # weak heuristic finding: emitted in ~65% of runs -> agreement < 1
            if rng.random() < 0.65:
                kept.append(ReviewerFinding(**item))

        notes: list[str] = []
        if reviewer == "legal":
            notes.append("AI risk perspective, not legal advice.")
        if reviewer == "fact_checker" and not ctx.facts:
            notes.append("No confirmed approved facts exist yet — all numeric claims will be unsupported.")
        return ReviewerOutput(reviewer=reviewer, findings=kept, notes=notes)

    # ------------------------------------------------------------------ #
    # helpers
    # ------------------------------------------------------------------ #
    def _mk(self, ctx: ReviewContext, reviewer: ReviewerName, start: int, end: int, *,
            issue: str, why: str, impact: str, severity: str, suggestion: str | None = None,
            category: str, rule: dict | None = None, evidence_query: str | None = None,
            evidence_strength: float = 0.5, direct_contradiction: bool = False,
            deterministic: bool = False, evidence_requires_number: bool = False) -> dict | None:
        text = ctx.text
        start = max(0, min(start, len(text)))
        end = max(start, min(end, len(text)))
        if end == start:
            return None
        span_text = text[start:end]
        if not span_text.strip():
            return None

        evidence_ref = None
        strength = evidence_strength
        query = evidence_query
        if query is None and rule is not None and reviewer != "fact_checker":
            query = f'{rule.get("title", "")} {rule.get("body", "")}'
        if query is not None:
            hits = [h for h in ctx.evidence_for(query)
                    if self._evidence_supports(h, span_text, query, require_number=evidence_requires_number)]
            if hits:
                ev = hits[0]
                evidence_ref = {
                    "document": ev.get("document", ""), "page": ev.get("page"),
                    "section": ev.get("section"), "chunk_id": ev.get("chunk_id"),
                    "snippet": (ev.get("text", "")[:280] or None),
                }
                strength = max(strength, float(ev.get("score", 0.0)))
        return {
            "reviewer": reviewer, "span_start": start, "span_end": end, "span_text": span_text,
            "issue": issue, "why": why, "evidence_ref": evidence_ref, "impact": impact,
            "severity": severity, "suggestion": suggestion,
            "rule_key": rule.get("key") if rule else None,
            "category": category, "deterministic": deterministic,
            "direct_contradiction": direct_contradiction,
            "evidence_strength": round(min(0.99, strength), 3),
        }

    @staticmethod
    def _evidence_supports(ev: dict, span_text: str, query: str,
                           require_number: bool = False) -> bool:
        """A citation is only attached when the chunk actually bears on the finding.

        Requires either two shared content words with the span/query, or a shared
        number. Anything weaker is dropped so the UI can honestly say
        "No approved source found" instead of showing an irrelevant document.
        """
        chunk = (ev.get("text") or "").lower()
        if not chunk:
            return False
        chunk_tokens = set(re.findall(r"[a-z0-9]{4,}", chunk))
        key_tokens = set(re.findall(r"[a-z0-9]{4,}", f"{span_text} {query}".lower()))
        shared = key_tokens & chunk_tokens
        span_numbers = set(re.findall(r"\d+(?:[.,]\d+)?", span_text))
        chunk_numbers = set(re.findall(r"\d+(?:[.,]\d+)?", chunk))
        if require_number:
            # A numeric claim is only "sourced" when the chunk carries the same number
            # next to the same words - a bare digit match (e.g. a section number) is not evidence.
            for number in span_numbers:
                for m in re.finditer(r"(?<![\d.,])" + re.escape(number) + r"(?![\d])", chunk):
                    window = chunk[max(0, m.start() - 45): m.end() + 45]
                    if set(re.findall(r"[a-z]{4,}", window)) & {t for t in key_tokens if len(t) >= 4}:
                        return True
            return False
        return len(shared) >= 2 or bool(span_numbers & chunk_numbers)

    @staticmethod
    def _why(rule: dict | None, fallback: str) -> str:
        if rule and rule.get("body"):
            return f'{rule["title"]}: “{rule["body"]}”'
        return fallback

    def _iter_matches(self, text: str, phrase: str):
        for m in re.finditer(re.escape(phrase), text, re.I):
            yield m.start(), m.end(), m.group(0)

    # ------------------------------------------------------------------ #
    # 1. Brand Voice
    # ------------------------------------------------------------------ #
    def _brand_voice(self, ctx: ReviewContext) -> list[dict]:
        out: list[dict] = []
        rule = ctx.rule("brand_voice", "tone", "hype", "voice")
        for word in HYPE:
            for s, e, found in self._iter_matches(ctx.text, word):
                out.append(self._mk(
                    ctx, "brand_voice", s, e,
                    issue=f'Hype language: “{found}”',
                    why=self._why(rule, "Brand voice is plain-spoken and confident; superlatives and hype are out of bounds."),
                    impact="Erodes trust with the audience and reads as advertising puffery.",
                    severity="medium", suggestion=self._suggest_plainer(found, rule),
                    category="brand_voice", rule=rule, evidence_query=f"{word} {rule['body'] if rule else ''}",
                    evidence_strength=0.55 + (0.2 if rule else 0.0), direct_contradiction=bool(rule),
                ))
        for word in COLLOQUIAL:
            for s, e, found in self._iter_matches(ctx.text, word):
                out.append(self._mk(
                    ctx, "brand_voice", s, e,
                    issue=f"Informal register: “{found}”",
                    why=self._why(rule, "We write in a warm but professional register."),
                    impact="Inconsistent tone across channels.",
                    severity="low", suggestion=found[0].upper() + found[1:] + " — rephrase in a neutral, professional register.",
                    category="brand_voice", rule=rule, evidence_strength=0.45,
                ))
        # sentence length / readability, and double exclamation marks
        for m in re.finditer(r"[^.!?\n]+[.!?]+", ctx.text):
            sentence = m.group(0)
            words = re.findall(r"[\w'-]+", sentence)
            if len(words) > 34:
                out.append(self._mk(
                    ctx, "brand_voice", m.start(), m.start() + len(sentence.rstrip()),
                    issue=f"Very long sentence ({len(words)} words)",
                    why=self._why(rule, "Sentences should stay under ~25 words so the message is easy to scan."),
                    impact="Low readability on mobile, where most of our audience reads.",
                    severity="low",
                    suggestion="Split into two sentences and lead with the verb.",
                    category="brand_voice", rule=rule, evidence_strength=0.4,
                ))
            if sentence.count("!") >= 2:
                out.append(self._mk(
                    ctx, "brand_voice", m.start(), m.start() + len(sentence.rstrip()),
                    issue="Multiple exclamation marks in one sentence",
                    why=self._why(rule, "Confidence is expressed through clarity, not punctuation."),
                    impact="Reads as shouty and reduces perceived quality.",
                    severity="low", suggestion=sentence.replace("!!", "!").strip(),
                    category="brand_voice", rule=rule, evidence_strength=0.45,
                ))
        if ctx.content_type == "social_post":
            for m in re.finditer(r"(?:^|\n)([^\n]{0,20}#\w+(?:\s+#\w+){4,})", ctx.text):
                out.append(self._mk(
                    ctx, "brand_voice", m.start(1), m.end(1),
                    issue="Hashtag wall on a social post",
                    why=self._why(rule, "Use at most three purposeful hashtags per social post."),
                    impact="Hashtag stuffing reduces reach and looks spammy.",
                    severity="low", suggestion="Keep the three most relevant hashtags.",
                    category="brand_voice", rule=rule, evidence_strength=0.4,
                ))
        return out

    @staticmethod
    def _suggest_plainer(found: str, rule: dict | None) -> str:
        table = {
            "revolutionary": "new", "game-changing": "notably better", "game changing": "notably better",
            "world-class": "high quality", "best-in-class": "among the best", "cutting-edge": "modern",
            "unleash": "start using", "supercharge": "speed up", "effortless": "simple", "seamless": "smooth",
            "synergy": "teamwork", "leverage": "use", "disrupt": "change", "next-level": "improved",
            "amazing": "good", "insane": "remarkable", "mind-blowing": "impressive",
            "unparalleled": "strong", "industry-leading": "well known", "unrivalled": "competitive",
            "10x": "much faster", "one-stop shop": "single place",
        }
        return table.get(found.lower(), "State the concrete benefit instead of the superlative.")

    # ------------------------------------------------------------------ #
    # 2. Terminology
    # ------------------------------------------------------------------ #
    def _terminology(self, ctx: ReviewContext) -> list[dict]:
        out: list[dict] = []
        rule = ctx.rule("terminology", "preferred", "approved", "plain english", "term")
        for bad, good in PLAIN_ENGLISH.items():
            for s, e, found in self._iter_matches(ctx.text, bad):
                out.append(self._mk(
                    ctx, "terminology", s, e,
                    issue=f"Preferred term not used: “{found}”",
                    why=self._why(rule, f'Approved terminology maps “{bad}” to “{good}”.'),
                    impact="Inconsistent vocabulary across channels weakens recall.",
                    severity="low",
                    suggestion=good[0].upper() + good[1:] if found[0].isupper() else good,
                    category="terminology", rule=rule,
                    evidence_query=f"{bad} {good} terminology",
                    evidence_strength=0.8, direct_contradiction=bool(rule),
                ))
        # product / brand naming variants from confirmed assets & facts
        for name in ctx.brand.get("naming_variants", []):
            wrong, right = name.get("wrong"), name.get("right")
            if not wrong or not right:
                continue
            for s, e, found in self._iter_matches(ctx.text, wrong):
                out.append(self._mk(
                    ctx, "terminology", s, e,
                    issue=f"Product name written as “{found}”",
                    why=self._why(rule, f'The approved written form is “{right}”.'),
                    impact="Search, tagging and legal notices depend on the exact product name.",
                    severity="medium", suggestion=right, category="terminology", rule=rule,
                    evidence_strength=0.85, direct_contradiction=True,
                ))
        return out

    # ------------------------------------------------------------------ #
    # 3. Fact Checker
    # ------------------------------------------------------------------ #
    def _fact_checker(self, ctx: ReviewContext) -> list[dict]:
        out: list[dict] = []
        rule = ctx.rule("fact", "claim", "fact", "substantiate", "evidence")
        for claim in extract_claims(ctx.text):
            verdict, matched, contradicting = self._judge_claim(claim, ctx)
            if verdict == "supported":
                continue
            if verdict == "contradicted":
                out.append(self._mk(
                    ctx, "fact_checker", claim["start"], claim["end"],
                    issue=f'Claim contradicts an approved fact: “{claim["text"][:120]}”',
                    why=self._why(rule, "Approved facts are the only permitted source of numbers in content.") +
                        f' Approved fact says: “{matched["statement"]}”.',
                    impact="A demonstrably wrong number in public content is a compliance and trust incident.",
                    severity="high", suggestion=f'Use the approved figure: “{matched["statement"]}”',
                    category="fact", rule=rule,
                    evidence_query=matched["statement"], evidence_strength=0.9, direct_contradiction=True,
                ))
            else:
                out.append(self._mk(
                    ctx, "fact_checker", claim["start"], claim["end"],
                    issue=f'Unsupported claim: “{claim["text"][:120]}”',
                    why=self._why(rule, "No approved document in the Brand Kit supports this statement."),
                    impact="Unsubstantiated claims are the most common source of advertising complaints.",
                    severity="medium",
                    suggestion="Cite an approved fact, or soften to a qualitative statement.",
                    category="fact", rule=rule, evidence_query=claim["text"], evidence_strength=0.35,
                    evidence_requires_number=True,
                ))
        return out

    @staticmethod
    def _judge_claim(claim: dict, ctx: ReviewContext) -> tuple[str, dict | None, bool]:
        """supported | unsupported | contradicted, against confirmed approved facts."""
        best, best_score = None, 0.0
        claim_tokens = set(claim["keywords"])
        for fact in ctx.facts:
            f_tokens = {t for t in re.findall(r"[a-z0-9]+", fact["statement"].lower()) if len(t) > 2}
            if not f_tokens:
                continue
            overlap = len(claim_tokens & f_tokens) / max(1, len(claim_tokens))
            if overlap > best_score:
                best, best_score = fact, overlap

        claim_numbers = set(claim["numbers"])
        if best and best_score >= 0.45:
            fact_numbers = set(re.findall(r"\d+(?:[\.,]\d+)?", best["statement"]))
            if claim_numbers and fact_numbers and not (claim_numbers & fact_numbers):
                return "contradicted", best, True
            if claim_numbers and fact_numbers and (claim_numbers & fact_numbers):
                return "supported", best, False
            if not claim_numbers:
                return "supported", best, False
        # a numeric claim with no matching approved number is unsupported, even with topic overlap
        if claim_numbers and (not best or best_score < 0.45):
            return "unsupported", best, False
        if best and best_score >= 0.45:
            return "supported", best, False
        return "unsupported", None, False

    # ------------------------------------------------------------------ #
    # 4. Visual
    # ------------------------------------------------------------------ #
    def _visual(self, ctx: ReviewContext) -> list[dict]:
        out: list[dict] = []
        rule = ctx.rule("visual", "logo", "image", "aspect", "colour", "color")
        brand = ctx.brand or {}
        allowed_ratios = brand.get("aspect_ratios", {}) or {}
        fonts = {f.lower() for f in brand.get("fonts", [])}
        logo_version = str(brand.get("logo_version", "") or "")

        for block in ctx.blocks:
            meta = block.get("meta") or {}
            if block.get("kind") != "image":
                continue
            w, h = int(meta.get("width") or 0), int(meta.get("height") or 0)
            s, e = block.get("start", 0), block.get("end", 0)
            if w and h:
                if w < 800:
                    out.append(self._mk(
                        ctx, "visual", s, e,
                        issue=f"Image too small: {w}×{h}px",
                        why=self._why(rule, "Delivered images must be at least 800px wide for retina screens."),
                        impact="Soft, blurry imagery on high-density displays.",
                        severity="medium", suggestion=f"Export at least 1600×{int(1600 * h / max(w,1))}px.",
                        category="visual", rule=rule, evidence_strength=0.9, deterministic=True,
                    ))
                ratio = round(w / max(h, 1), 3)
                allowed = allowed_ratios.get(ctx.content_type)
                if allowed:
                    allowed_vals = [round(float(r), 3) for r in allowed]
                    if not any(abs(ratio - r) <= 0.02 for r in allowed_vals):
                        out.append(self._mk(
                            ctx, "visual", s, e,
                            issue=f"Aspect ratio {ratio:.2f}:1 not permitted for {ctx.content_type}",
                            why=self._why(rule, f"Approved ratios for {ctx.content_type}: " +
                                          ", ".join(f"{r:.2f}:1" for r in allowed_vals) + "."),
                            impact="Cropping in the channel feed will cut text or the logo.",
                            severity="medium",
                            suggestion=f"Crop to {allowed_vals[0]:.2f}:1 ({w}×{int(w / allowed_vals[0])}px).",
                            category="visual", rule=rule, evidence_strength=0.85, deterministic=True,
                        ))
                if meta.get("font"):
                    used = str(meta["font"]).lower()
                    if fonts and used not in fonts:
                        out.append(self._mk(
                            ctx, "visual", s, e,
                            issue=f"Non-brand font used: “{meta['font']}”",
                            why=self._why(rule, "Approved typefaces: " + ", ".join(sorted(fonts)) + "."),
                            impact="Off-brand typography undermines recognition.",
                            severity="medium", suggestion="Re-render using the approved brand typeface.",
                            category="visual", rule=rule, evidence_strength=0.9, deterministic=True,
                        ))

        # logo version references in copy / metadata
        for m in re.finditer(r"\b(old|legacy|previous|v1|1\.0)\s+logo\b", ctx.text, re.I):
            out.append(self._mk(
                ctx, "visual", m.start(), m.end(),
                issue="Old or legacy logo referenced",
                why=self._why(rule, f"Current approved logo version is {logo_version or 'the latest version'}."),
                impact="Using a retired logo creates version drift across the estate.",
                severity="medium", suggestion="Use the current approved logo lock-up.",
                category="visual", rule=rule, evidence_query=f"logo version {logo_version}",
                evidence_strength=0.75, direct_contradiction=bool(logo_version),
            ))
        # declared colours outside the palette (text mentions like "font colour #333333")
        palette = {str(c).lower() for c in (brand.get("colours") or [])}
        for m in re.finditer(r"#([0-9a-f]{6})\b", ctx.text, re.I):
            hexv = "#" + m.group(1).lower()
            if palette and hexv not in palette:
                out.append(self._mk(
                    ctx, "visual", m.start(), m.end(),
                    issue=f"Off-palette colour {hexv}",
                    why=self._why(rule, "Only approved brand colours may be specified: " + ", ".join(sorted(palette)) + "."),
                    impact="Colour drift dilutes the visual identity.",
                    severity="low", suggestion="Map to the nearest approved brand colour.",
                    category="visual", rule=rule, evidence_strength=0.9, deterministic=True,
                ))
        return out

    # ------------------------------------------------------------------ #
    # 5. Accessibility
    # ------------------------------------------------------------------ #
    def _accessibility(self, ctx: ReviewContext) -> list[dict]:
        out: list[dict] = []
        rule = ctx.rule("accessibility", "contrast", "alt", "readab", "text size", "accessib")
        size_rule = _specific_rule(ctx, "accessibility", ("14pt", "16px", "minimum text", "text size"), rule)
        link_rule = _specific_rule(ctx, "accessibility", ("link text", "click here"), rule)
        caps_rule = _specific_rule(ctx, "accessibility", ("capitals", "all caps", "caps"), rule)
        colour_rule = _specific_rule(ctx, "accessibility", ("colour alone", "color alone"), rule)
        alt_rule = _specific_rule(ctx, "accessibility", ("alt text", "alt"), rule)
        for m in SMALL_TEXT_RE.finditer(ctx.text):
            size = float(m.group(1))
            if size < 14:
                out.append(self._mk(
                    ctx, "accessibility", m.start(), m.end(),
                    issue=f"Text size {m.group(0)} is below the 14pt minimum",
                    why=self._why(size_rule, "Body copy must be at least 14pt / 16px for legibility."),
                    impact="Excludes low-vision readers and fails WCAG 1.4.4.",
                    severity="high", suggestion="Increase body copy to at least 16px.",
                    category="accessibility", rule=size_rule, evidence_strength=0.9, deterministic=True,
                ))
        for m in re.finditer(r"\b(?:click|tap|read)\s+here\b|\blearn more\b(?!\s*(?:about|on|at))", ctx.text, re.I):
            line = ctx.text[max(0, m.start() - 40):m.end() + 10].strip()
            out.append(self._mk(
                ctx, "accessibility", m.start(), m.end(),
                issue="Non-descriptive link text",
                why=self._why(link_rule, "Link text must describe the destination out of context."),
                impact="Screen-reader users navigating by links cannot tell where “here” goes.",
                severity="medium", suggestion="Name the destination, e.g. “Read the pricing guide”.",
                category="accessibility", rule=link_rule, evidence_strength=0.8, direct_contradiction=bool(link_rule),
            ))
        for m in re.finditer(r"\b([A-Z][A-Z0-9&/'\-]{3,}(?:\s+[A-Z][A-Z0-9&/'\-]{2,}){3,})\b", ctx.text):
            out.append(self._mk(
                ctx, "accessibility", m.start(), m.end(),
                issue="Long block of ALL CAPS text",
                why=self._why(caps_rule, "Blocks of all capitals longer than three words are not permitted; "
                                         "all-caps is harder to read and some screen readers announce it letter by letter."),
                impact="Reduced readability for dyslexic and low-vision readers.",
                severity="medium", suggestion=m.group(1).capitalize().rstrip() + ".",
                category="accessibility", rule=caps_rule, evidence_strength=0.75, deterministic=True,
            ))
        for m in re.finditer(r"\b(?:the\s+)?(red|green|blue|orange|yellow)\s+(button|link|text|box|icon)\b", ctx.text, re.I):
            out.append(self._mk(
                ctx, "accessibility", m.start(), m.end(),
                issue=f"Instruction relies on colour alone: “{m.group(0)}”",
                why=self._why(colour_rule, "Meaning must never depend on colour alone (WCAG 1.4.1)."),
                impact="Colour-blind users may not be able to follow the instruction.",
                severity="medium", suggestion="Add a label or position cue alongside the colour.",
                category="accessibility", rule=colour_rule, evidence_strength=0.8,
                direct_contradiction=bool(colour_rule),
            ))
        for block in ctx.blocks:
            meta = block.get("meta") or {}
            if block.get("kind") == "image" and "alt" in meta and not str(meta.get("alt") or "").strip():
                out.append(self._mk(
                    ctx, "accessibility", block.get("start", 0), block.get("end", 0),
                    issue="Image has an empty alt attribute",
                    why=self._why(alt_rule, "Decorative images use alt=\"\"; informative images need a description."),
                    impact="Screen-reader users lose the information the image carries.",
                    severity="high", suggestion="Describe the image in `alt`, or mark it decorative deliberately.",
                    category="accessibility", rule=alt_rule, evidence_strength=0.95, deterministic=True,
                ))
        return out

    # ------------------------------------------------------------------ #
    # 6. Legal
    # ------------------------------------------------------------------ #
    def _legal(self, ctx: ReviewContext) -> list[dict]:
        out: list[dict] = []
        rule = ctx.rule("legal", "guarantee", "claim", "legal", "proof", "substantiat")
        for phrase, (severity, explanation) in RISKY_LEGAL.items():
            phrase_rule = _specific_rule(ctx, "legal", (phrase, *phrase.split()[:2]), rule)
            for s, e, found in self._iter_matches(ctx.text, phrase):
                supported = self._legal_supported(found, ctx)
                if supported:
                    continue
                out.append(self._mk(
                    ctx, "legal", s, e,
                    issue=f'Risky claim: “{found}”',
                    why=self._why(phrase_rule, explanation + " No proof is held in the Brand Kit."),
                    impact="Exposure to advertising-standards complaints and regulator action.",
                    severity=severity,
                    suggestion="Remove the absolute claim and describe the verified benefit instead.",
                    category="legal", rule=phrase_rule, evidence_query=f"{phrase} substantiation proof",
                    evidence_strength=0.85 if severity in ("high", "critical") else 0.6,
                    direct_contradiction=severity in ("high", "critical"),
                ))
        free_rule = _specific_rule(ctx, "legal", ("hidden fees", "free", "condition"), rule)
        for m in re.finditer(r"\b(?:free|completely free|totally free)\b(?!\s*trial)(?!\s*of charge)", ctx.text, re.I):
            out.append(self._mk(
                ctx, "legal", m.start(), m.end(),
                issue='"Free" offer without qualification',
                why=self._why(free_rule, "Free claims must state any condition, time limit or upsell clearly."),
                impact="Misleading-omission risk under consumer protection rules.",
                severity="medium", suggestion="State the condition: e.g. “Free for the first 30 days”.",
                category="legal", rule=free_rule, evidence_strength=0.55,
            ))
        return out

    def _legal_supported(self, phrase: str, ctx: ReviewContext) -> bool:
        """A risky phrase is only exempt when an approved fact or doc chunk explicitly backs it."""
        for fact in ctx.facts:
            if phrase.lower() in fact["statement"].lower():
                return True
        hits = ctx.evidence_for(phrase, limit=1)
        return bool(hits and float(hits[0].get("score", 0)) >= 0.6 and phrase.lower() in hits[0].get("text", "").lower())

    # ------------------------------------------------------------------ #
    # Brand-kit ingestion: propose rules / terms / facts
    # ------------------------------------------------------------------ #
    def propose_rules(self, text: str, meta: dict) -> dict:
        """Propose rules / terms / facts for Admin confirmation.

        Deliberately conservative: a candidate is only produced when a line reads
        like an instruction ("Never…", "Use…", "Must…"), a term mapping, or an
        approved fact. Nothing here is applied until an Admin confirms it.
        """
        rules, terms, facts = [], [], []
        raw_kind = meta.get("kind", "guideline")
        # "1. Brand Voice" must not be split into "1." + "Brand Voice" by the
        # sentence splitter, so normalise numbered headings first.
        prepared = re.sub(r"(?m)^(\d{1,2})\.\s+", r"\1) ", text or "")
        lines = [ln.strip() for ln in re.split(r"\n+|(?<=[.!?])\s+(?=[A-Z0-9])", prepared) if ln.strip()]
        heading: str | None = None

        instruction = re.compile(
            r"^(?:[-•*]|\d+[.)])?\s*(?:must|never|always|avoid|use|do not|don't|should|required|prohibited)\b", re.I)
        numbered_heading = re.compile(r"^\d+[.)]\s+[A-Z][A-Za-z &/,'-]{2,60}$")
        use_instead = re.compile(
            r"use\s+[“\"']?([\w \-]{2,30}?)[”\"']?\s+(?:instead of|rather than|not)\s+[“\"']?([\w \-]{2,30}?)[”\"']?[.;]?$",
            re.I)
        banned_quoted = re.compile(r"^(?:banned|avoid|never use|do not use|prohibited)[:\s]+[“\"']([^”\"']{2,40})[”\"']", re.I)
        approved_quoted = re.compile(r"^(?:approved|preferred|use)[:\s]+[“\"']([^”\"']{2,40})[”\"']", re.I)
        fact_line = re.compile(r"^([\w \-/]{3,40})[:\-]\s*(.+)$")
        say_not = re.compile(
            r"\bsay\s+[“\"']?([\w \-]{2,30}?)[”\"']?\s*,?\s+(?:not|instead of|rather than)\s+[“\"']?([\w \-]{2,30}?)[”\"']?(?:[.;]|$)",
            re.I)

        for ln in lines:
            if numbered_heading.match(ln) or (ln.endswith(":") and len(ln) < 80 and not instruction.match(ln)):
                heading = re.sub(r"^\d+[.)]\s+", "", ln).rstrip(":").strip()
                continue

            m = use_instead.search(ln)
            if m:
                good, bad = m.group(1).strip(), m.group(2).strip()
                terms.append({"kind": "banned", "value": bad, "replacement": good,
                              "severity": "medium", "note": ln[:200]})
                terms.append({"kind": "approved", "value": good, "replacement": None,
                              "severity": "low", "note": ln[:200]})
                continue

            m = say_not.search(ln)
            if m:
                good, bad = m.group(1).strip(), m.group(2).strip()
                terms.append({"kind": "approved", "value": good[:60], "replacement": None,
                              "severity": "low", "note": ln[:200]})
                terms.append({"kind": "banned", "value": bad[:60], "replacement": good[:60],
                              "severity": "medium", "note": ln[:200]})
                continue

            m = banned_quoted.match(ln)
            if m:
                for value in [v.strip() for v in m.group(1).split(",") if v.strip()][:6]:
                    terms.append({"kind": "banned", "value": value[:60], "replacement": None,
                                  "severity": "medium", "note": ln[:200]})
                continue

            in_facts_section = raw_kind in ("approved_facts", "term_list") or bool(
                heading and re.match(r"^(?:approved facts|facts|approved claims)", heading, re.I))
            if in_facts_section:
                m = fact_line.match(ln)
                if m:
                    facts.append({"statement": ln[:300], "topic": m.group(1).strip(),
                                  "value": m.group(2).strip()[:80]})
                    continue

            m = approved_quoted.match(ln)
            if m:
                terms.append({"kind": "approved", "value": m.group(1).strip()[:60], "replacement": None,
                              "severity": "low", "note": ln[:200]})
                continue

            if instruction.match(ln) or (ln.endswith((".", "!", "?")) and len(ln) > 30 and heading):
                category = self._guess_category(f"{heading or ''} {ln}")
                rules.append({
                    "title": (heading or "Rule")[:120],
                    "body": ln[:600],
                    "category": category,
                    "key_hint": self._guess_key(category, heading, ln),
                    "check_type": "deterministic" if category in ("terminology",) and "term" in ln.lower() else "both",
                    "requires_approver": category in ("legal", "accessibility"),
                    "source_section": heading,
                })

        # de-duplicate by body, keep the first
        seen_rules, uniq = set(), []
        for rule in rules:
            if rule["body"] in seen_rules:
                continue
            seen_rules.add(rule["body"])
            uniq.append(rule)
        seen_terms, uniq_terms = set(), []
        for term in terms:
            key = (term["kind"], term["value"].lower())
            value = term["value"]
            if (key in seen_terms or len(value.split()) > 4
                    or re.search(r"\b(or|and)\b", value, re.I)):
                continue
            seen_terms.add(key)
            uniq_terms.append(term)
        return {"rules": uniq[:60], "terms": uniq_terms[:120], "facts": facts[:80]}

    @staticmethod
    def _guess_category(hay: str) -> str:
        h = hay.lower()
        table = [
            ("legal", ["guarantee", "legal", "substantiat", "regulated", "compliance", "proof", "superiority"]),
            ("accessibility", ["contrast", "alt text", "accessib", "screen reader", "wcag", "text size", "readab",
                               "click here", "link text", "all caps", "capitals", "colour alone", "14pt",
                               "16px", "body copy", "minimum text"]),
            ("visual", ["logo", "colour", "color", "font", "typeface", "image", "aspect", "layout", "palette",
                        "photograph", "typography"]),
            ("terminology", ["term", "vocabulary", "instead of", "approved word", "wording", "spelling", "say "]),
            ("fact", ["approved fact", "figure", "statistic", "number", "claim"]),
            ("brand_voice", ["tone", "voice", "sentence", "hype", "superlative", "exclamation", "plain"]),
        ]
        for cat, keys in table:
            if any(k in h for k in keys):
                return cat
        return "brand_voice"

    @staticmethod
    def _guess_key(category: str, heading: str | None, line: str) -> str:
        prefix = {"brand_voice": "VOI", "terminology": "TERM", "fact": "FACT",
                  "visual": "VIS", "accessibility": "A11Y", "legal": "LEG"}[category]
        slug = re.sub(r"[^A-Za-z0-9]+", " ", f"{heading or ''} {line}").strip().split()
        tail = "".join(w[0] for w in slug[:4]).upper() or "GEN"
        return f"{prefix}-{tail}"
