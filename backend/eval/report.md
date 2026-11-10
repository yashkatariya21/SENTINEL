# Sentinel AI — pipeline regression benchmark (rule-based engine)

This report scores the shipped rule engine against hand-labelled samples. It exists to catch regressions when rules change. It is **not** an LLM quality measurement: the samples were written alongside the rules and share their pattern vocabulary, so the numbers describe fit to this set, not generalisation to unseen copy. LLM quality is measured separately by `eval/run_llm_eval.py`.

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
* The **single-prompt baseline** is a deliberately weaker rule pass over the same text: every pattern in one sweep, no per-reviewer job, no cited rule, no evidence requirement, no duplicate merging. It is deterministic and free. It is **not** an LLM and must not be quoted as one — it exists to show what structure (six lenses, citations, merging) contributes over a flat keyword sweep.
* The pipeline numbers come from the real code path (`services.pipeline.analyse_text`), including the deterministic checks and the span-overlap merge step.
* **Shared vocabulary, disclosed:** the samples and the rule pattern lists were written together, so a reviewer that matches a pattern will often match a sample that was designed around it. That circularity is why `seed/heldout_samples.py` exists: 20 adversarial samples, written after the rules and never used for tuning, are scored separately in `eval/heldout.json`. Read the two together.

## Missed detections (worst 8 per reviewer)

**fact_checker**
- `F02` unsupported_claim: “Join 3.2 million customers who plan their quarter with us.”

---

## Held-out adversarial set (reported separately)

**20 samples written after the rules and never used for tuning.** This is the number to trust for generalisation, not the regression table above.

12 of the 20 samples deliberately reuse the shipped pattern vocabulary; 8 avoid it (H02, H03, H07, H08, H09, H13, H17, H19). A miss is therefore most informative on the second group — that is where the rule engine has no shortcut.

| Scoring | Precision | Recall | F1 |
|---|---|---|---|
| strict (correct reviewer *and* span overlap) | 0.29 | 0.26 | 0.27 |
| relaxed (any reviewer covering the span) | 0.52 | 0.48 | 0.50 |

Mean sample-level false-positive rate across the six reviewers on samples that carry no seeded mistake: 0.06.

### What it missed

**brand_voice**
- `H07` banned_word: “costs less than a coffee run”
- `H11` tone_mismatch: “a bit of a no-brainer, innit”
- `H11` tone_mismatch: “plug your data in and chill”
- `H18` banned_word: “Cheap”

**terminology**
- `H10` deprecated_term: “Forecast Suite Classic”

**fact_checker**
- `H08` unsupported_claim: “within two percent of actuals”
- `H15` unsupported_claim: “reduce planning time by 40%”
- `H20` unsupported_claim: “Approved by every regulator”

**visual**
- `H12` contrast_failure: “#FFFF00 text on #FFFFFF background”

**accessibility**
- `H12` contrast: “#FFFF00 text on #FFFFFF background”
- `H13` alt_text: “The chart has no axis labels and no alternative text”

**legal**
- `H08` guarantee: “promise every forecast will land within two percent of actuals”
- `H09` superlative: “Nothing on the market comes close”
- `H16` guarantee: “guaranteed to be the cheapest available”
- `H17` superlative: “best​ in the world​”
- `H19` superlative: “la meilleure du marché”
- `H20` superlative: “The world's best, cheapest, fastest forecasting tool”

Read this honestly: the rule engine is a regression-checked heuristic, not a language model. It reproduces the tuning set almost perfectly and generalises at roughly half that on unfamiliar paraphrases. The LLM configuration is what closes that gap — see `eval/report_llm.md` (requires an API key; no numbers are written without one).
