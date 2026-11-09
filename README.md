# Sentinel AI

**Pre-publication brand governance.** Employees upload content, six specialist AI reviewers check it
against the company's Brand Kit, every finding is explained with a cited reason, humans approve, and the
system learns from manager decisions.

> It reviews and explains. It **never publishes**, **never auto-fixes**, and **never changes a rule
> without a manager's click**.

| | |
|---|---|
| Frontend | Next.js 14 (App Router) + React 18 + Tailwind |
| Backend | Python 3.12 FastAPI, REST/JSON under `/v1` |
| Data | PostgreSQL 16 + pgvector (SQLite fallback for local/demo) |
| Auth | JWT (local HS256) or Supabase/Clerk JWKS verification |
| AI | Provider-agnostic adapter: offline deterministic engine (default) or hosted LLM + embeddings, **server-side only** |
| Parsing | PyMuPDF, python-docx, optional OCR (pytesseract) |
| Tests | 54 pytest cases (`pytest -q`), plus a labelled-set evaluation harness |

---

## 1. Run it locally (2 minutes)

```bash
# ── backend ────────────────────────────────────────────────────────────────
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # defaults are safe: SQLite + offline AI engine
python -m seed.seed             # fictional company + Brand Kit + 16 demo submissions
uvicorn app.main:app --reload --port 8000
# API docs: http://127.0.0.1:8000/docs   health: /health

# ── frontend (new terminal) ────────────────────────────────────────────────
cd frontend
npm install
npm run dev                     # http://localhost:3000  (proxies /v1 → 127.0.0.1:8000)
```

**Demo sign-in** (all users share the password `Sentinel!2026`):

| Email | Role | Why you'd sign in as them |
|---|---|---|
| `ada@northwind.example` | Admin | Workspace, Brand Kit, audit log |
| `maya@northwind.example` | Brand Manager | Confirms extracted rules, edits rules |
| `raj@northwind.example` | Approver | Confirms legal/accessibility rule changes |
| `tom@northwind.example` | Manager | Reviews team content, answers the learning prompt |
| `ines@northwind.example` | Manager | Second manager (needed to approve Tom's items) |
| `leo@northwind.example` | Creator | Submits content, sees only their own |
| `nina@northwind.example` | Creator | Product team |
| `sam@northwind.example` | External Creator | Limited, external-comment-only view |

The login screen has a **“View as” switcher** in the header so you can jump between roles mid-session and
watch permissions change.

Screens: [`docs/images/`](docs/images) — login, overview, review report, Brand Kit, rules history,
approval, learning, analytics.

**No paid service is required.** The default `LLM_PROVIDER=local` runs a deterministic, offline
implemented reviewer engine, so the whole product is demonstrable with zero keys and zero spend. Switching
to a hosted model is one environment variable (see §7).

---

## 2. What the product actually does

### Roles (every request is scoped to one organisation)

| Role | Brand Kit | Rules | Content | Decisions | Approve | Promote rules | Analytics | Audit |
|---|---|---|---|---|---|---|---|---|
| Admin | write | write | all | ✅ | ✅ | ✅ | ✅ | ✅ |
| Brand Manager | write | write | all | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approver | read | read | all | ✅ | ✅ | ✅ (incl. legal/a11y) | ✅ | ✅ |
| Manager | read | read | all | ✅ | ✅ (not own) | ✅ (not legal/a11y) | ✅ | — |
| Creator | read | read | own | — | — | — | — | — |
| External Creator | read | read | own | — | — | — | — | — |

Enforced in `app/security.py` (`Principal.require(...)` per endpoint), in every query
(`get_owned()` returns **404, not 403**, for another tenant's object so existence never leaks), and at the
database level by Postgres RLS (`migrations/rls.sql`, `FORCE ROW LEVEL SECURITY` + `app.current_org`).

### Pages

| Route | Purpose |
|---|---|
| `/login` | Sign in or create a workspace (org + first Admin), demo role switcher |
| `/` | Overview: Brand Score + formula, queue, guardrails, how a review runs |
| `/kit` | Brand Kit: document upload & ingestion, **proposals awaiting Admin confirmation**, terms, approved facts, colours/fonts/logo, readiness checks |
| `/new` | New submission: paste text or upload DOCX/PDF/image, choose content type + department |
| `/content` | Content queue with status/search filters |
| `/content/[id]` | **Review Report**: highlighted spans, findings grouped by reviewer, severity/type filters, finding cards |
| `/content/[id]/approval` | **Approval view**: version history, comments (internal/external), timeline, approve/reject/request-changes |
| `/rules` | Rules with versions: author, date, scope, reason, **revert** |
| `/learn` | Adaptive learning: overrides, learning-prompt answers, Approver gate, regression runs |
| `/analytics` | Brand Score, mistake mix, department compliance, approval time, repeats, 8-week trend, monthly report |
| `/audit` | Append-only, hash-chained audit log with chain verification |

### The finding card (the core of the product)

Every finding shows **Issue**, **Why** (guideline section + quoted rule), **Evidence** (document, page,
section, supporting snippet), **Impact**, **Suggestion** — plus:

* `Confirmed` / `Possible` label,
* confidence band + numeric confidence,
* `Human review required` flag,
* the AI **provider, model and prompt version**,
* **“No approved source found”** when no citation exists (never a fabricated one).

Actions: **Accept**, **Edit**, **Dismiss with reason**, **Escalate**. Dismissing or editing as a manager
opens the learning prompt: *“Make this an approved rule?” → Yes / No / Yes for one department or content
type only.* Nothing is applied until that is answered, and legal/accessibility changes additionally require
an **Approver**.

---

## 3. Review pipeline

```
upload / paste
      │
      ▼
1. Extract            PyMuPDF · python-docx · Pillow (+OCR when enabled) → text blocks + image metadata
                      prompt-injection scan (content is data, never instructions)
      ▼
2. Deterministic      approved/banned terms · colour values · alt text · WCAG contrast · image size
   checks (first)     → Confirmed findings, each tied to a rule ID, no model involved
      ▼
3. Retrieve           org-scoped rules, terms, approved facts + brand-kit chunks (pgvector, 300–500 token
                      chunks with overlap; lexical fallback on SQLite)
      ▼
4. Six reviewers      Brand Voice · Terminology · Fact Checker · Visual · Accessibility · Legal
   in parallel        each returns strict Pydantic-validated JSON; repeated `LLM_REPEAT_RUNS` times
      ▼
5. Merge & score      duplicates merged by span overlap; label + confidence + human-review flag
      ▼
6. Human decision     accept / edit / dismiss(reason) / escalate → optional learning prompt → rule version
```

**Confidence formula** (documented, deterministic):

```
confidence = 0.45 × agreement_across_repeat_runs
           + 0.35 × evidence_strength      (rule match + retrieval score, 1.0 for deterministic checks)
           + 0.20 × deterministic_backing  (1.0 when a deterministic check produced the finding)

band:  < 0.50 low   ·  0.50–0.75 medium  ·  ≥ 0.75 high
human_review_required = confidence < 0.55 OR severity ∈ {high, critical}
label:  Confirmed  = deterministic check OR direct contradiction of a cited source
        Possible   = model judgement without either
```

Guardrails implemented in code, not configuration: a suggestion is dropped unless it stays within the
flagged span (`_suggestion_is_span_local`); a citation is dropped unless it resolves to a retrieved chunk
*and* genuinely bears on the span (`_evidence_supports`, including a number-match requirement for numeric
claims); deterministic findings can never be “talked out of” by a model because they are produced first and
carry `deterministic_backing = 1.0`.

Every run stores **model, provider, embedding model, prompt version and the exact rule versions applied**
(`analysis_runs.rule_versions`), so any finding is reproducible and auditable.

---

## 4. Adaptive learning

1. A manager **dismisses with reason** or **edits** a suggestion → an `override` is created.
2. The UI asks: **“Make this an approved rule?”** → *Yes* / *No* / *Yes, for one department or content type only*.
3. A **new rule version** is written (author, date, scope, reason). Old versions are marked `superseded`,
   never deleted → `/rules` shows the full history with a **Revert** button (revert appends a new version).
4. **Legal and accessibility** rule changes require an **Approver**: a manager's override lands in
   `pending_approval` and cannot be promoted by a manager (tested).
5. Every promotion triggers a **regression run** over the labelled set; if any reviewer's F1 drops by more
   than 0.05 versus the previous run, the promotion is flagged in `/learn` and in the API response.

Scope is real: a rule scoped to `content_type=ad` only fires on ads
(`services/retrieval.rules_in_scope`).

---

## 5. Data model

`organisations · users · memberships · brand_kits · documents · chunks · rules · rule_versions · terms ·
facts · assets · content_items · content_versions · analysis_runs · findings · decisions · overrides ·
comments · approvals · audit_log · regression_runs`

Every tenant-owned table carries `org_id` and is indexed on it; RLS policies compare `org_id` to
`app.current_org`. `audit_log` is append-only in the API (no update/delete routes), hash-chained
(`prev_hash` → `entry_hash`), un-`UPDATE`-able for the app role, and `/v1/audit` verifies the chain.

---

## 6. Analytics

On-screen formula (also returned by the API):

```
Brand Score = 100 × (0.50 × SeverityIndex + 0.30 × ComplianceRate + 0.20 × ApprovalRate)

SeverityIndex  = max(0, 1 − Σ(severity weight) ÷ (10 × analysed submissions))
                 weights: low 1 · medium 2 · high 4 · critical 8   (dismissed-by-manager findings excluded)
ComplianceRate = share of analysed submissions with no open high/critical finding
ApprovalRate   = approved ÷ (approved + rejected)        (0.5 when no decisions yet)
```

Plus: most common mistakes (ranked by **weighted severity**, not raw count), department compliance,
average approval time, repeated violations, 8-week brand-health trend, top violated guideline, monthly
report. Analytics are visible to Manager and above (enforced by the API, not just the nav).

---

## 7. AI providers

One adapter interface (`app/llm/base.py`), two implementations:

| `LLM_PROVIDER` | What runs | Cost |
|---|---|---|
| `local` *(default)* | `LocalEngine` — deterministic, offline, per-reviewer heuristics over the Brand Kit | £0 |
| `openai` / `openai_compatible` | Any OpenAI-compatible chat + embeddings endpoint, JSON-mode, Pydantic-validated | your account |
| `anthropic` | Anthropic Messages API (embeddings via the configured gateway) | your account |

Both paths share the same prompt contract, the same strict output schema, and the same post-processing, so
the UI is identical. Keys exist only in the backend environment; the browser never sees them and the
frontend talks to Next.js, which proxies `/v1` to FastAPI.

> **Ask before adding a paid service.** This build intentionally ships with `local` so nothing is charged.
> To use a hosted model, set `LLM_PROVIDER`, `LLM_MODEL`, `EMBEDDING_MODEL` and `LLM_API_KEY` in the
> backend environment (and, on Postgres, keep `vector(1536)` alignment with your embedding model).

Provider transparency: `/v1/provider`, `/v1/meta` and every finding expose provider + model + prompt version.

---

## 8. Tests and evaluation

```bash
cd backend
pytest -q                 # 54 passed
python -m eval.run_eval   # precision / recall / F1 / FP-rate per reviewer vs. single-prompt baseline
```

*Deterministic checks* are unit tested: WCAG contrast maths (21:1 black/white, amber-on-white fails AA),
word-boundary term matching (`cheaper` is not `cheap`), unconfirmed terms ignored, alt-text presence,
low-resolution images, off-palette colours, span de-duplication.

*Workflow permissions* are integration tested through the real API: no self-approval, creator cannot
approve, reject requires a reason, submit requires a completed analysis, external creators see only their
own content, **cross-organisation access returns 404**, duplicate workspace slug rejected, audit chain
verifies, override promotion creates a new rule version with scope, legal overrides need an Approver,
prompt-injection text is reviewed as data and never obeyed.

### Labelled-set results (53 hand-labelled samples, 8 deliberately clean)

| Reviewer | Precision | Recall | F1 | FP rate | Baseline P | Baseline R | Baseline F1 | Δ F1 |
|---|---|---|---|---|---|---|---|---|
| brand_voice | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | 1.00 | 1.00 | +0.00 |
| terminology | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | 0.71 | 0.83 | +0.17 |
| fact_checker | 0.92 | 0.92 | 0.92 | 0.03 | 0.39 | 0.54 | 0.45 | +0.47 |
| visual | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | 0.00 | 0.00 | +1.00 |
| accessibility | 1.00 | 1.00 | 1.00 | 0.00 | 1.00 | 0.75 | 0.86 | +0.14 |
| legal | 1.00 | 1.00 | 1.00 | 0.00 | 0.90 | 1.00 | 0.95 | +0.05 |
| **micro** | **0.98** | **0.98** | **0.98** | **0.00** | 0.74 | 0.70 | 0.72 | +0.26 |

False-positive rate is *sample-level* (share of clean samples that still got a finding — the “crying wolf”
number brand teams care about). Matching is span overlap IoU ≥ 0.3 with one-to-one label matching. The
**single-prompt baseline** is a faithful, deterministic proxy for a one-shot LLM prompt: all patterns in one
pass, no per-reviewer job, no cited rule, no evidence requirement, no duplicate merging.

Read the full method and the missed-detection list in [`docs/EVALUATION.md`](docs/EVALUATION.md) and
[`backend/eval/report.md`](backend/eval/report.md).

---

## 9. Security and responsible AI

Credentials, limits and provider switches live in environment variables only (`.env.example` documents
every one; `.gitignore` blocks `.env`).

* **Uploads**: MIME allow-list, magic-byte sniffing, 20 MB cap, DOCX signature check, stored outside the
  web root; delete controls for documents, content and the whole organisation.
* **Prompt injection**: submitted content is wrapped as data (`<<<CONTENT>>> … <<<END CONTENT>>>`), the
  system prompt forbids following it, and every run records an injection scan surfaced to reviewers.
* **No fabricated citations**: citations must resolve to a retrieved chunk that shares content words or the
  claimed number; otherwise the UI says *“No approved source found”*.
* **Human control**: no auto-fix, no auto-publish, no rule change without a manager's answer; nobody
  approves their own item (API + DB trigger); legal/accessibility rules need an Approver.
* **Transparency**: provider, model, embedding model and prompt version on every run and every finding.
* **Legal reviewer** output is labelled *“AI risk perspective, not legal advice”* in both API notes and UI.

Details and threat model: [`docs/SECURITY-AND-RESPONSIBLE-AI.md`](docs/SECURITY-AND-RESPONSIBLE-AI.md).

---

## 10. Deployment

**Database (once)** — Postgres 16 + pgvector, then:

```sql
ALTER DATABASE sentinel SET search_path TO public;
CREATE EXTENSION IF NOT EXISTS vector;
```

`app/db.py` creates tables on boot and installs `migrations/rls.sql`; the vector index is created by that
migration.

**Backend — Render or Railway**

* `render.yaml` blueprint (Docker + managed Postgres) is included: *New → Blueprint*.
* Railway: point the service at `backend/Dockerfile`, add a Postgres plugin, set `DATABASE_URL`.
* Required env: `DATABASE_URL`, `SECRET_KEY`, `AUTH_MODE` (+`AUTH_JWKS_URL`), `LLM_PROVIDER`,
  `LLM_MODEL`, `EMBEDDING_MODEL`, `LLM_API_KEY`, `STORAGE_BACKEND=s3`, `S3_BUCKET`, `S3_REGION`,
  `CORS_ORIGINS`, `SEED_ON_STARTUP=0`.

**Frontend — Vercel**

* Root directory `frontend`; `vercel.json` rewrites `/v1/*` to the API and sets security headers.
* Set `API_URL` (build-time) or edit the rewrite destination in `vercel.json`.

**Local production-like stack**: `docker compose up --build` (Postgres+pgvector, API, web).

---

## 11. Repository map

```
backend/
  app/
    main.py            FastAPI app, /v1 routers, /health, /v1/meta
    config.py          every env var in one place
    db.py              engine, sessions, RLS binding, init
    models.py          20 tables, org_id everywhere
    schemas.py         API + strict reviewer output contracts
    security.py        JWT, roles, permissions, org scoping, 404-on-foreign-object
    audit.py           hash-chained append-only audit log
    storage.py         MIME/size validation, local or S3
    llm/               base adapter, local engine, hosted provider, factory
    services/          extraction, deterministic checks, retrieval, pipeline, workflows, analytics, regression
    routers/           auth, brand_kit, content, overrides, analytics
  seed/                Northwind Analytics brand kit + 53 labelled samples
  eval/                metrics, baseline, run_eval, report.md
  tests/               deterministic + permission tests
  migrations/rls.sql    RLS, append-only audit, no-self-approval trigger, pgvector index
frontend/
  app/                 login, overview, content, report, approval, kit, rules, learn, analytics, audit
  lib/                 api client, auth context
  app/components/      Shell, FindingCard, HighlightedText, LearningPrompt, ui primitives
docs/                  architecture, API reference, security & responsible AI, evaluation, demo script
```

---

## 12. Honest limitations

* The default `local` engine is **transparent heuristics**, not a language model. It is deliberately
  explainable and free, and it is the reason the evaluation numbers are reproducible; a hosted provider
  swaps in real semantic judgement behind the same contract (and should be re-evaluated with
  `eval.run_eval` before you trust its numbers).
* The single-prompt baseline is a proxy for a one-shot LLM, not a benchmark of any specific model.
* OCR is optional and off by default (needs the `tesseract` binary); scanned PDFs without a text layer
  produce an “no extractable text” block.
* `LLM_REPEAT_RUNS` defaults to 3: agreement scoring costs three passes per reviewer. Lower it for latency,
  accepting weaker confidence separation.
* SQLite mode exists for local/demo only — it has no RLS and scores embeddings in-process. Use Postgres in
  any shared environment.
* Documents are versioned per upload (new upload = new version), not diffed at the section level.

---

## 13. Build order that was followed

1. Foundation + auth + org scoping + audit
2. Brand Kit (ingest → chunk → embed → propose → confirm)
3. Extraction + deterministic checks + retrieval
4. Voice / Terminology / Fact / Legal reviewers + finding cards
5. Approval workflow, version history, comments
6. Adaptive learning for terminology → then for all categories, incl. the Approver gate
7. Visual + Accessibility reviewers
8. Analytics + audit views
9. Tests, labelled evaluation, deployment configuration
