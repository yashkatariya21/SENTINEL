# Changelog

Newest first. Every number in here comes from a run recorded in `backend/eval/`, and
`python -m eval.doc_facts` fails the build if this file's published figures and the
documents' figures stop agreeing with those runs.

---

## Evaluation screen, in a deploy that does not ship `eval/`

### Fixed

- The **Evaluation** screen no longer reads "No report on disk" on a healthy deployment.
  A serverless build traces only the files reachable from `api/index.py`, so
  `backend/eval/report.json` is simply not there and every number read "not measured”.
  `python -m eval.snapshot` now bakes the last recorded run into
  `backend/app/eval_snapshot.py` (committed), and the router serves that copy when no
  file is on disk.
- The copy is labelled as a copy. Every response carries `source` and `recorded_at`, and
  the card renders "recorded copy · <time> · bundled at build time; re-run to refresh" —
  a bundled number can never be presented as a live measurement. The live path says
  `eval/report.json` and shows the provider/model that produced it.
- `run_eval.py` stamps `generated_at`, `provider`, `model`, `embedding_mode` and
  `repeat_runs` into the report, so a number without a time or a provider is no longer
  possible.
- When nothing at all has been measured the card says so and offers **Measure it now**
  (plus the CLI equivalent) instead of instructing the reader to go and run a command.
  It names the path it looked in.
- The LLM card falls back to the tracked `eval/report_llm.md` column — measured offline,
  no key — rather than showing nothing, and states that no hosted model was measured.
- The **confidence-band table** moved onto the screen. It was in the docs but not in the
  UI, which left the confidence score unfalsifiable. The copy is fixed, not flattering:
  medium and high are tied on this data, so the card says the band is a sort order rather
  than a probability.

### Added

- `python -m eval.snapshot --check` fails when the committed copy drifts from
  `eval/report.json`. CI runs it after the benchmark, so a bundled number cannot go
  stale. It compares **measurements, not clocks** — CI re-runs the benchmark, so
  `generated_at` always differs there, and comparing it would train everyone to ignore
  the check.
- `tests/test_evaluation_sources.py` (12 cases): the snapshot imports, contains Python
  rather than JSON literals, the fallback serves the recorded numbers exactly, live and
  recorded sources are distinguishable, a missing snapshot yields `null` rather than
  `0.0`, and the drift check catches a moved number, tolerates a new timestamp and
  survives an unimportable generated file.

---

## Round 3 — free model, learning loop, image evidence

Three workstreams, each finished and verified before the next started. **197 pytest
cases** at the end of it; the frontend builds clean; CI runs on Postgres + pgvector with a
real `tesseract` binary.

### Added — AI Brand Review Committee on a free model (A)

- `LLM_PROVIDER=openai_compatible` with `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`:
  Ollama, llama.cpp, vLLM, LM Studio or any free gateway. No paid key needed.
- One price table (`app/llm/pricing.py`). A priced model reports tokens × list price; an
  unpriced or free model reports **0.00** with the basis named (`unpriced`); no model call
  at all reports `deterministic`. Never `null`.
- `MAX_CALLS` budget and repeated-429 back-off raise `ProviderLimitReached`, so the
  pipeline falls back to `LocalEngine` and records the fallback in `analysis_runs.metrics`
  instead of failing the run.
- Invalid model JSON: one retry, then the finding is discarded and logged. A model cannot
  crash a review.
- Confidential content skips external calls entirely and says so in its metrics.
- `eval/run_llm_eval.py` rewritten: `full_context` drives the shipped path
  (`HostedLLM.review()` with a real `ReviewContext`, repeat runs, `merge_findings`), the
  simplified prompts remain as `specialists_no_rules`, and the offline engine is a column.
  Reports P/R/F1, FP rate, p50/p95 latency, calls used, cost with its basis, and the exact
  model name. `--samples blind`, `--limit N`, disk cache.
- `seed/blind_samples.py`: 25 new blind samples, written *after* the generalisation fixes,
  never tuned on, never in CI, scored once.

### Added — Adaptive Learning: guideline changes (C)

- Upload accepts `replaces_document_id`, or finds its predecessor by kind + filename;
  `version = previous + 1`, with lineage recorded in `Document.meta`.
- `services/guideline_diff.py`: sections parsed from numbered headings, markdown headings
  and DOCX heading blocks; matched by normalised title then `difflib` ratio; reports
  added / removed / changed / unchanged plus a similarity score.
- New tables `guideline_changes` and `rule_review_tasks`. A rule whose source section
  changed or vanished opens a task and **stays active** until a person answers:
  keep / edit (appends a rule version, old one kept) / retire (deactivates, never deletes).
  Each answer is audit-logged; a legal or accessibility rule needs an **Approver**.
- `GET /guideline-changes`, `GET /rule-review-tasks`, `GET /rule-review-tasks/count`,
  `POST /rule-review-tasks/{id}/decide`.
- Frontend: a “needs review” badge and banner on `/rules`, and a comparison sheet at
  `/rules/changes`.
- Regression now compares against a **pinned baseline run** (`GET /regression/baseline`,
  `POST /regression/pin`); the 0.05 F1 promotion flag is unchanged.

### Added — Explainability by Design: image evidence (B)

- OCR with geometry: `pytesseract.image_to_data` gives per-word boxes, lines and
  confidences; scanned PDF pages are rasterised (PyMuPDF, 200 dpi) and read. `tesseract-ocr`
  is installed in the Docker image (`OCR_ENABLED=1`) and in CI.
- `services/image_analysis.py`: dominant colours with pixel share, palette distance in
  CIE Lab (ΔE76), contrast measured **inside OCR word boxes**, aspect ratio versus the
  approved ratios, and PDF image placement from `page.get_image_info()`.
- `findings.visual_evidence` (added through `ADDED_COLUMNS`, no migration):
  `{page, bbox_norm, detected_text, detected_value:{kind, measured, expected}}` — in
  `FindingOut` and `GET /analysis-runs/{id}`.
- `GET /content/{id}/original`: the stored original, org-scoped and role-checked, PNG/JPEG/
  WebP only, `nosniff`, audit-logged. The finding card draws the measured box over the
  picture and prints **Measured → Expected**, with “not measured” when nothing was.
- Optional: perceptual-hash logo similarity (PNG only), always labelled **Possible** —
  `merge_findings` refuses to promote it to Confirmed.

### Added — hardening and docs (D)

- `python -m eval.doc_facts`: rebuilds every published figure from `eval/report.json`,
  `eval/heldout.json` and pytest's own collection, then checks the exact lines are present
  in `README.md`, `QUICKSTART.md` and `docs/EVALUATION.md`. Stale numbers now fail CI.
- CI installs `tesseract` so the OCR tests run for real; a repository-policy step fails if
  the blind set is referenced from CI or from any default evaluation path.
- `CHANGELOG.md` (this file) and a free-model setup section in the README.

### Measured (offline engine, no key)

| Measurement | Result |
|---|---|
| Labelled set, 53 samples | micro P/R/F1 **0.98 / 0.98 / 0.98** (baseline 0.72) |
| Confidence bands (labelled) | low 0.92 (11/12) · medium 1.00 (24/24) · high 1.00 (14/14) — medium and high **tied**, so “high beats medium” is not established |
| Held-out, 20 samples never tuned on | strict **0.38 / 0.52 / 0.44**, relaxed 0.47 / 0.65 / 0.55, FP rate 0.07 |
| `eval/report_llm.md`, offline_engine, held-out | P 0.48 · R 0.52 · F1 0.50 · FP rate 0.02 · p95 34.5 ms · 0 provider calls |
| Blind set (25, scored once) | strict F1 0.43 → **0.70**; relaxed 0.50 → **0.76** after the generalisation fixes |

### Fixed

- **The guideline diff was blind.** It rebuilt the previous version from chunks, which are
  cut on token counts and lose the headings that define a section — so every section looked
  “added”. Uploads now store the extraction and the diff uses it.
- **The Approver gate was dead code.** Answering a review task required `brand_kit:write`,
  which excludes the Approver role, so the legal/accessibility branch could never fire and
  an Approver could not answer at all. Now role-checked, with a plain refusal for a Brand
  Manager.
- A banned term found in OCR'd text showed `expected: null` even though the rule named a
  replacement; the remedy now travels with the box.
- Task payloads carried no `guideline_change_id`, so a client could not tie a task to the
  change that opened it.

### Known gaps

- The `/evaluation` page reads the rule-engine report, not `report_llm.json`.
- The blind before/after table lives in this changelog, not yet in `docs/`.
- No hosted-model number is published: none has been measured.

---

## Round 2 — the proof desk

- UI task: the public brief leads to sign-in, the desk follows; a real founder's note.
  Warm light theme with a night shift; the rail works in both.
- Later UI rounds: cream day shift, a drawer that belongs, a gate instead of a padlock,
  the brief before the app.

## Round 1 — the product

- Foundation: FastAPI + SQLAlchemy, org scoping on every row, hash-chained audit log.
- Brand Kit: ingest → chunk → embed → propose → confirm; nothing becomes a rule until a
  human confirms it.
- Six reviewers behind one adapter contract, deterministic checks first, findings carrying
  rule, citation, confidence and human-review flag.
- Approval workflow with version history and comments; no self-approval.
- Adaptive learning from manager overrides, with scope and an Approver gate.
- Analytics, audit views, PDF review record, and the labelled/hold-out evaluation.
