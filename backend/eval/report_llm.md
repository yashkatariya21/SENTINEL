# Sentinel AI — LLM evaluation

Generated 2026-11-15T10:57:00Z · provider `local` · model `sentinel-local-1` · embeddings offline · temperature 0.0 · seed 20260101 · 1 repeat run(s).

Latency and tokens are measured per call. Cached calls are excluded from latency percentiles. Cost is 0.00 with basis 'unpriced' for a free or local model. `full_context` uses the shipped prompt, parser and merge step; only the HTTP call is cached.

## Held-out adversarial set (never used for tuning)

| Configuration | Model | Samples | Precision | Recall | F1 | FP rate | p50 ms | p95 ms | Calls | Cost (USD) |
|---|---|---|---|---|---|---|---|---|---|---|
| `offline_engine` | `sentinel-local-1` | 20 | 0.48 | 0.52 | 0.50 | 0.02 | 22.7 | 34.5 | 0 | $0.0000 |

### Precision by confidence band

| Configuration | low | medium | high | Monotonic |
|---|---|---|---|---|
| `offline_engine` | — | 0.55 (22) | 0.00 (3) | no |

Too few findings in at least one band to compare bands. The band is a sort order here, not a measured probability.

### Misses (first 12)

- `offline_engine` · brand_voice · `H11` tone_mismatch: “a bit of a no-brainer, innit”
- `offline_engine` · brand_voice · `H11` tone_mismatch: “plug your data in and chill”
- `offline_engine` · brand_voice · `H18` banned_word: “Cheap”
- `offline_engine` · terminology · `H10` deprecated_term: “Forecast Suite Classic”
- `offline_engine` · fact_checker · `H08` unsupported_claim: “within two percent of actuals”
- `offline_engine` · fact_checker · `H15` unsupported_claim: “reduce planning time by 40%”
- `offline_engine` · fact_checker · `H20` unsupported_claim: “Approved by every regulator”
- `offline_engine` · visual · `H12` contrast_failure: “#FFFF00 text on #FFFFFF background”
- `offline_engine` · accessibility · `H12` contrast: “#FFFF00 text on #FFFFFF background”
- `offline_engine` · accessibility · `H13` alt_text: “The chart has no axis labels and no alternative text”
- `offline_engine` · legal · `H17` superlative: “best​ in the world​”
