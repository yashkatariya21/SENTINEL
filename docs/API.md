# API reference (`/v1`, JSON)

Base URL: your API host, e.g. `https://sentinel-api.onrender.com`. Interactive docs: `/docs` (OpenAPI at
`/openapi.json`). Every endpoint except `POST /v1/auth/login`, `POST /v1/auth/workspace`, `GET /v1/meta`
and `GET /health` requires `Authorization: Bearer <jwt>`.

Error shape: `{"detail": "human readable message"}` with `400` (bad input), `401` (bad/expired token),
`403` (role not allowed — includes *self-approval*), `404` (**also used for another organisation's
objects**, so existence never leaks), `409` (wrong state), `413`/`415` (upload), `422` (schema validation).

## Auth & workspace

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/workspace` | public | Create organisation + first Admin. Body: `org_name, slug, admin_name, admin_email, admin_password, departments[]`. Returns token + user + organisation |
| POST | `/auth/login` | public | `{email, password}` → `{access_token, user, organisation}` |
| GET | `/auth/me` | any | user, organisation, permission flags |
| GET | `/auth/users` | any | users in this organisation |
| POST | `/auth/users` | admin | `{email, name, role, department, password}` |

## Brand Kit

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/brand-kits` | admin, brand_manager | create kit |
| GET | `/brand-kits` | all | list with counts |
| POST | `/brand-kits/{id}/activate` | admin, brand_manager | |
| POST | `/documents` | admin, brand_manager | multipart: `file`, `kind` (`guideline|legal|term_list|approved_facts|logo|other`), `brand_kit_id?`. Extracts, chunks 300–500 tokens with overlap, embeds, and stores **proposed** rules/terms/facts |
| GET | `/documents` | all | filename, kind, pages, chunks |
| DELETE | `/documents/{id}` | admin, brand_manager | deletes chunks + stored bytes (soft delete row) |
| GET | `/brand-kits/{id}/proposals` | all | rules/terms/facts awaiting Admin confirmation |
| POST | `/brand-kits/{id}/confirm` | admin, brand_manager | `{ids[], action: "confirm"\|"reject"}` — **the only way extracted items become active** |
| POST | `/brand-kits/{id}/refresh-proposals` | admin, brand_manager | re-derive candidates from this kit's documents |
| GET | `/brand-kits/{id}/health` | all | readiness checklist (6 reviewer categories covered, colours, fonts, logo, terms, facts) |
| GET/POST | `/terms`, DELETE `/terms/{id}` | read all / write admin+BM | term lists (`banned|approved|required`) |
| GET/POST | `/facts` | read all / write admin+BM | approved facts (the only permitted numbers) |
| GET/POST | `/assets` | read all / write admin+BM | colours, fonts, logo version (+ `meta.aspect_ratios`, `meta.contrast_pairs`, `meta.naming_variants`) |
| GET | `/rules` | all | current version of every rule with author, scope, source section |
| GET | `/rules/{id}/versions` | all | full history, newest first, `is_current` flag |
| PATCH | `/rules/{id}` | admin, brand_manager (+approver for legal/a11y) | **appends** a version; never overwrites |
| POST | `/rules/{id}/revert/{version}` | admin, brand_manager, approver | appends a copy of that version; `{reason}` |
| GET | `/provider` | any | which AI provider/model is in use (transparency) |

## Content

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/content` | creator+ | `{title, content_type: social_post\|blog\|ad\|email, department?, text, image_width?, image_height?}` |
| POST | `/content/upload` | creator+ | multipart: `file` (DOCX/PDF/PNG/JPG/WEBP/TXT), `title`, `content_type`, `department?`, `alt?` |
| GET | `/content` | scoped | managers+ see all; creators and external creators see only their own |
| GET | `/content/{id}` | scoped | includes current version text + blocks |
| GET | `/content/{id}/versions` | scoped | |
| POST | `/content/{id}/versions` | owner/manager | new version, status returns to `draft` |
| POST | `/content/{id}/analyze` | owner/manager | `202` + run id; background task |
| GET | `/content/{id}/runs` | scoped | |
| DELETE | `/content/{id}` | owner, admin, brand_manager | |
| GET | `/content/{id}/comments` · POST | scoped | `visibility: internal\|external`; external creators only ever see external comments |
| POST | `/content/{id}/submit` | owner/manager | requires a **complete** analysis → `409` otherwise; status `in_review` |
| POST | `/content/{id}/approve` | manager+ | `{action: approve\|reject\|request_changes, reason?, version?}`. **`403` if the actor owns the item**; reason required to reject/request changes |
| GET | `/content/{id}/approvals` | scoped | recorded decisions |
| GET | `/content/{id}/timeline` | scoped | versions + decisions + comments in order |

## Analysis & findings

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/analysis-runs/{id}` | scoped | status, provider/model/embedding/prompt version, `rule_versions[]`, `stats`, `metrics` (measured wall time, tokens, cost estimate), `findings[]` |
| GET | `/findings?content_item_id=&severity=` | scoped | flat list |
| POST | `/findings/{id}/decision` | manager+ | `{action: accept\|edit\|dismiss\|escalate, reason?, edited_suggestion?}`. Reason **required** for dismiss/escalate (422). Returns `learning_prompt` when a manager overrides |

`Finding` object (abridged):

```json
{
  "id": "…", "reviewer": "terminology", "category": "terminology",
  "severity": "medium", "label": "confirmed",
  "confidence": 1.0, "confidence_band": "high", "human_review_required": false,
  "span_start": 12, "span_end": 17, "span_text": "cheap",
  "issue": "Banned term: “cheap”",
  "why": "Approved vocabulary: “cheap” is on the Brand Kit banned-term list; the approved alternative is “affordable”.",
  "rule_quote": "Use the approved vocabulary: affordable not cheap, …",
  "rule_key": "TERM-001", "rule_version": 1,
  "evidence": {"document": "northwind-brand-guidelines-4.2.md", "page": 2, "section": "Terminology",
               "chunk_id": "…", "snippet": "…say affordable, not cheap…", "score": 0.61},
  "impact": "Inconsistent or off-brand wording in published material.",
  "suggestion": "affordable — Use “affordable” instead.",
  "deterministic": true, "provider": "local", "model": "sentinel-local-1",
  "prompt_version": "p2026-11-09.1", "agreement": 1.0, "evidence_strength": 1.0,
  "decision_status": "open"
}
```

## Adaptive learning

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/overrides` | manager+ | overrides with scope, status, proposed body, regression summary |
| POST | `/overrides/{id}/answer` | deciding manager | `{make_rule, scope: global\|department\|content_type, department?, content_type?, reason?}` → `promoted` (new rule version + regression) or `pending_approval` (legal/a11y) or `declined` |
| POST | `/overrides/{id}/promote` | approver (legal/a11y), admin, brand_manager | creates the rule version after sign-off; **manager gets 403 for legal/a11y** |
| GET | `/regressions` | manager+ | labelled-set regression runs after promotions |

## Analytics, audit, organisation

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/analytics/summary?window_days=90` | manager+ | Brand Score + `formula` + `inputs`, severity/reviewer mix, most common mistakes (weighted), department compliance, average approval hours, repeated violations, 8-week trend, top violated guideline, monthly report, provider info |
| GET | `/audit?limit=&action=` | admin, brand_manager, approver | entries + `chain: {ok, entries}` hash verification |
| GET | `/organisation` | any | name, departments, users |
| DELETE | `/organisation` | admin | right to erasure: deletes all rows scoped to the org |

## Evaluation

Both endpoints require `analytics:read` (manager and above). They serve only what is on disk; a missing
report is returned as `null`, never as a placeholder.

| Method | Path | Notes |
|---|---|---|
| GET | `/evaluation` | `regression` (rule engine, 53 samples), `heldout` (20 adversarial samples, strict + relaxed), `llm` (null unless `eval/run_llm_eval.py` has been run with a key), `provenance` strings, `generated` timestamps |
| POST | `/evaluation/run` | re-runs the **rule-engine** benchmark synchronously and rewrites `eval/report.{md,json}` + `eval/heldout.json`. It never calls a hosted model — that is an operator action (`python -m eval.run_llm_eval`), because it spends money |

## One-click demo

All four routes are gated on `DEMO_MODE` (default on locally; **404 when off**, and production refuses to
start unless it is off). `/load` and `/status` need no token so the login page can show progress; `/reset`
needs the demo workspace's Admin.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/demo/load?background=true` | none | builds the Northwind workspace and analyses every labelled sample. Idempotent: a second call creates nothing and returns `started: false`. `background=false` blocks until finished (used by tests) |
| GET | `/demo/status` | none | `state` (`idle`/`loading`/`running`/`done`/`error`), `phase`, `total`, `analysed`, `findings`, `errors[]`. Read from a table, not memory, so a restarted API still answers truthfully |
| POST | `/demo/session?as_email=` | none | **mints a JWT for a user of the demo workspace** — this is how the browser swaps roles without a password. No `as_email` → the Manager. `404` for an email outside the demo org, `403` for a deactivated user |
| POST | `/demo/reset` | demo Admin | deletes demo-flagged rows only (content, runs, findings, approvals, decisions, overrides, comments); the Brand Kit, rules and learned exceptions survive |

## Export

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/content/{id}/report.pdf?run_id=` | scoped | server-side PDF of the review record (reportlab): letterhead, submitted content, every finding with rule quote, citation, confidence and decision, "what this review did not do", and the disclaimer on every page. `409` if the item has no completed run; `404` for another organisation |

## System

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | status, database backend, AI provider info |
| — | rate limits | `429` + `Retry-After` on login (10/min/IP), upload (20/min/IP), demo load (3/min/IP) and demo session (30/min/IP) |
| GET | `/v1/meta` | product metadata: roles, the six reviewers, content types, guarantees list, provider |
