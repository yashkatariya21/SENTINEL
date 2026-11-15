/**
 * Everything the public page says, in one place.
 *
 * Rule for this file: no invented numbers, customers, logos, awards or testimonials. Every
 * figure here is either counted from the running product (`/v1/meta`, the role matrix) or
 * from the repository itself, and each carries a note on how it was measured.
 */

export interface LandingReviewer {
  key: string;
  name: string;
  role: string;
  question: string;
  /** x/y position on the floor plan, in viewBox units (0-100) */
  x: number;
  y: number;
}

/** Six reviewers, taken verbatim from the committee the API reports. */
export const REVIEWERS: LandingReviewer[] = [
  { key: "brand_voice", name: "Dame Vera", role: "Brand Voice", question: "Does it sound like us?", x: 50, y: 15 },
  { key: "terminology", name: "Professor Idris", role: "Terminology", question: "Is it the approved word?", x: 78, y: 34 },
  { key: "fact_checker", name: "Inspector Mei", role: "Fact Checker", question: "Where is the source?", x: 78, y: 68 },
  { key: "legal", name: "Judge Okonkwo", role: "Legal", question: "Where is the proof?", x: 50, y: 84 },
  { key: "visual", name: "Lord Mateo", role: "Visual", question: "Is that our blue?", x: 22, y: 68 },
  { key: "accessibility", name: "Dr. Amara", role: "Accessibility", question: "Can everyone read it?", x: 22, y: 34 },
];

export interface LandingFact {
  value: string;
  label: string;
  evidence: string;
}

/** Honest figures only. `evidence` says how each was obtained. */
export const FACTS: LandingFact[] = [
  { value: "6", label: "specialist reviewers", evidence: "reported by /v1/meta" },
  { value: "8", label: "human roles", evidence: "from the role matrix" },
  { value: "97", label: "automated tests", evidence: "pytest -q, local run — not CI" },
  { value: "1", label: "hash-chained audit log", evidence: "verified on every read" },
];

/* --------------------------------------------------------------- the demo
   A deterministic sample, rendered without the API so the page works with the
   server asleep. It mirrors what the terminology, brand-voice, legal and
   fact-checking passes actually return for this sentence. */

export const DEMO_DRAFT =
  "Our revolutionary planning engine lets you leverage the weekly rhythm to cut planning meetings in half. Guaranteed results in ninety days.";

export interface DemoFinding {
  id: string;
  reviewer: string;
  reviewerName: string;
  ruleKey: string;
  severity: "critical" | "major" | "moderate" | "minor";
  quote: string;
  problem: string;
  suggestion: string;
  source: string;
  page: string | null;
}

export const DEMO_FINDINGS: DemoFinding[] = [
  {
    id: "f1",
    reviewer: "brand_voice",
    reviewerName: "Dame Vera",
    ruleKey: "BV-02",
    severity: "major",
    quote: "revolutionary",
    problem:
      "Hype adjective. The Brand Kit asks for a concrete capability instead — what the engine does, in plain terms.",
    suggestion: "Our planning engine",
    source: "Brand Voice Guide, v3 — §2 Tone of voice",
    page: "4",
  },
  {
    id: "f2",
    reviewer: "terminology",
    reviewerName: "Professor Idris",
    ruleKey: "TM-04",
    severity: "moderate",
    quote: "leverage",
    problem: "Banned term. The approved vocabulary lists “use” for this sense.",
    suggestion: "use",
    source: "Terminology Sheet, v5 — approved vocabulary",
    page: "1",
  },
  {
    id: "f3",
    reviewer: "legal",
    reviewerName: "Judge Okonkwo",
    ruleKey: "LG-01",
    severity: "critical",
    quote: "Guaranteed results in ninety days",
    problem:
      "Absolute guarantee. A promise of outcome needs a stated basis, the conditions, and legal sign-off before publication.",
    suggestion:
      "State the measured outcome, its sample, and its conditions — or remove the sentence.",
    source: "Legal Playbook, v2 — §7 Claims and guarantees",
    page: "11",
  },
  {
    id: "f4",
    reviewer: "fact_checker",
    reviewerName: "Inspector Mei",
    ruleKey: "FC-03",
    severity: "major",
    quote: "cut planning meetings in half",
    problem:
      "Quantified claim with no approved source in the Brand Kit. The checker will not invent one.",
    suggestion:
      "Attach the study, or rewrite as a description of the workflow rather than a percentage.",
    source: "no approved source found",
    page: null,
  },
];

/** The six passes over the sample draft — two raised nothing, and say so. */
export const DEMO_PASSES: { reviewer: string; name: string; outcome: string; clear: boolean }[] = [
  { reviewer: "Brand Voice", name: "Dame Vera", outcome: "1 finding", clear: false },
  { reviewer: "Terminology", name: "Professor Idris", outcome: "1 finding", clear: false },
  { reviewer: "Fact Checker", name: "Inspector Mei", outcome: "1 finding", clear: false },
  { reviewer: "Legal", name: "Judge Okonkwo", outcome: "1 finding", clear: false },
  { reviewer: "Visual", name: "Lord Mateo", outcome: "nothing to raise", clear: true },
  { reviewer: "Accessibility", name: "Dr. Amara", outcome: "nothing to raise", clear: true },
];

/* --------------------------------------------------------------- marquee
   Phrases the reviewers really flag, lifted from the labelled sample set in
   backend/seed/samples.py — not written for the landing page. */

export const FLAGGED_PHRASES: { phrase: string; reviewer: string }[] = [
  { phrase: "revolutionary", reviewer: "brand voice" },
  { phrase: "World-class", reviewer: "brand voice" },
  { phrase: "game-changing", reviewer: "brand voice" },
  { phrase: "seamless", reviewer: "brand voice" },
  { phrase: "Unleash", reviewer: "brand voice" },
  { phrase: "Cutting-edge", reviewer: "brand voice" },
  { phrase: "industry-leading", reviewer: "brand voice" },
  { phrase: "Leverage", reviewer: "terminology" },
  { phrase: "synergy", reviewer: "terminology" },
  { phrase: "Prior to", reviewer: "terminology" },
  { phrase: "utilize", reviewer: "terminology" },
  { phrase: "ForecastCloud", reviewer: "terminology" },
  { phrase: "Guaranteed results", reviewer: "legal" },
  { phrase: "100% safe", reviewer: "legal" },
  { phrase: "risk-free", reviewer: "legal" },
  { phrase: "best company", reviewer: "legal" },
  { phrase: "a decade of warehouse data", reviewer: "fact checker" },
  { phrase: "instant approval", reviewer: "fact checker" },
];

/** The three movements of a review, used by the pinned section. */
export const MOVEMENTS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "It reads against your charter",
    body:
      "Six reviewers read the submission at once — voice, terminology, facts, visual, accessibility, legal. Each one consults the Brand Kit and the rules your organisation has actually approved, and nothing else.",
  },
  {
    n: "02",
    title: "Every finding shows its source",
    body:
      "A finding quotes the exact span, names the rule, and cites the section and page it came from. When there is no approved source, it says so plainly rather than inventing one.",
  },
  {
    n: "03",
    title: "A person decides",
    body:
      "Sentinel proposes. It never publishes, never auto-fixes, and never changes a rule without a manager’s click. An override becomes a versioned exception, scoped and reversible — and it is written to the audit log.",
  },
];
