# Sentinel AI — evaluation report

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
