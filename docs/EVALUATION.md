# Evaluation

Two things are measured:

1. **Behaviour tests** (`cd backend && pytest -q`, 54 cases) — deterministic checks, finding
   attribution, Brand Kit proposal lifecycle and workflow permissions. These are correctness
   guarantees, not quality estimates.
2. **A labelled-set evaluation** (`python -m eval.run_eval`) — precision, recall, F1 and
   false-positive rate per reviewer, compared against a single-prompt baseline.

## Labelled set

`backend/seed/samples.py` holds **53 hand-written samples** for the fictional Northwind Analytics
workspace, each with human-labelled spans:

* 8 samples are **deliberately clean** (no seeded mistake) — they exist only to measure false positives.
* Mistakes cover all six reviewers: banned terms (`cheap`, `utilize`, `Leverage`, `ForecastCloud`),
  hype (`revolutionary`, `world-class`, `seamless`), risky claims (`Guaranteed results`, `100% safe`,
  `best company`, `risk-free`), wrong numbers (`98%` renewals vs the approved `87%`, `£18` vs `£24`),
  unsupported numbers (`3.2 million customers`, `42% faster`), accessibility issues (`12pt`, `10px`,
  `click here`, ALL-CAPS blocks, colour-only instructions) and visual issues (off-palette hexes,
  retired logo versions).

## Scoring rules

* **True positive** = same reviewer *and* span overlap with the label at IoU ≥ 0.3; each label matches once.
* **False-positive rate** is sample-level: share of samples with no seeded mistake for that reviewer that
  still received a finding. That is the "crying wolf" number a brand team actually feels.
* **The baseline** (`backend/eval/baseline.py`) is a deterministic proxy for the single-prompt pattern —
  one pass, no per-reviewer job description, no mandatory rule citation, no evidence lookup, no span
  merging. It is a proxy for the *architecture*, not for a specific model.

## Important note on manager-approved exceptions

The benchmark runs with `honour_exceptions=False`. It measures how well the reviewers read the written
brand rules. Manager-approved exceptions (`docs/ARCHITECTURE.md`, "learning loop") are the organisation's
later policy decisions: they are applied in the running app and are exercised by the regression run that
fires after every promotion, but they must not flatter or distort this score.

Results (repeat runs = 3)

Labelled samples: **53** (fictional Northwind Analytics content with seeded mistakes; 8 samples are deliberately clean to measure the false-positive rate).

| Reviewer | Precision | Recall | F1 | FP rate | Baseline P | Baseline R | Baseline F1 | Δ F1 |
|---|---|---|---|---|---|---|---|---|
| brand_voice | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 | +0.00 |
| terminology | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | 0.71 | 0.83 | +0.17 |
| fact_checker | 0.92 | 0.92 | 0.92 | 0.03 | 0.39 | 0.54 | 0.45 | +0.47 |
| visual | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | 0.00 | 0.00 | +1.00 |
| accessibility | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | 0.75 | 0.86 | +0.14 |
| legal | 1.00 | 1.00 | 1.00 | 0.00 | 0.90 | 1.00 | 0.95 | +0.05 |
| **micro** | 0.98 | 0.98 | 0.98 | 0.00 | 0.74 | 0.70 | 0.72 | +0.26 |

## How the numbers are produced

* A prediction counts as a true positive when the reviewer name matches and its span overlaps the hand-labelled span (IoU >= 0.3). Each label can only be matched once.
* **False-positive rate** is sample-level: share of samples with no seeded mistake for that reviewer that nevertheless received a finding. This is the 'crying wolf' number brand teams care about.
* The **single-prompt baseline** is a faithful proxy for a one-shot LLM prompt: all patterns in one pass, no per-reviewer job description, no cited rule, no evidence requirement, no duplicate merging. It is deterministic so the comparison is reproducible and costs nothing.
* The pipeline numbers come from the real code path (`services.pipeline.analyse_text`), including the deterministic checks and the span-overlap merge step.

## Missed detections (worst 8 per reviewer)

**fact_checker**
- `F02` unsupported_claim: “Join 3.2 million customers who plan their quarter with us.”
