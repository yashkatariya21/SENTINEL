# Architecture

```
┌──────────────────────────── Browser ────────────────────────────┐
│ Next.js 14 App Router (Vercel)                                  │
│  /login  /  /content  /content/[id]  /content/[id]/approval      │
│  /new  /kit  /rules  /learn  /analytics  /audit                 │
│  lib/api.ts — one fetch wrapper, JWT in localStorage            │
│  app/components/{Shell,FindingCard,HighlightedText,LearningPrompt}│
└───────────────┬─────────────────────────────────────────────────┘
                │  same-origin  /v1/*   (next.config rewrites → API_URL)
                ▼
┌──────────────────────────── FastAPI (Render / Railway) ─────────┐
│ routers/  auth · brand_kit · content · overrides · analytics     │
│ security.py  JWT → Principal(org_id, role) → permission checks   │
│              + set_request_org() for Postgres RLS                │
│ services/ extraction · deterministic · retrieval · pipeline      │
│           workflows · analytics · regression                     │
│ llm/      base (contract) · local_engine · hosted · factory       │
│ audit.py  append-only hash chain                                 │
│ storage.py  MIME/size validation · local disk or S3              │
└───────────────┬───────────────────────────┬─────────────────────┘
                │ SQLAlchemy 2                │ HTTPS (server-side only)
                ▼                             ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ PostgreSQL 16 + pgvector     │   │ Hosted LLM / embeddings      │
│ 20 tables, org_id everywhere │   │ (optional; local engine is   │
│ RLS policies, append-only    │   │  the default)                │
│ audit, no-self-approval      │   └──────────────────────────────┘
│ trigger, IVFFlat vector index│
└──────────────────────────────┘
```

## Why these boundaries

* **The browser never calls the AI provider or the API origin directly.** Next.js rewrites `/v1/*`, so the
  token is same-origin, CORS is unnecessary, and the API base URL is not baked into client code.
* **One AI adapter interface.** Reviewers are written against `LLMAdapter.review(reviewer, ctx)` returning
  a Pydantic-validated object. Swapping `local` → `openai` changes judgement quality, not plumbing.
* **Deterministic checks bypass the model entirely.** Terms, colours, alt text, contrast and image size are
  computed in `services/deterministic.py` and are unit tested. They are the anchor of every confidence
  score, so a model can never downgrade a factually certain finding.
* **Learning writes versions, never edits.** `services/workflows.promote()` appends a `rule_version` and
  marks the previous one `superseded`; `revert_rule_version()` appends a copy of the old body. History is
  immutable, which is what makes the audit trail meaningful.

## Request lifecycle (analysis)

1. `POST /v1/content/{id}/analyze` verifies ownership/permission, creates an `analysis_run` row
   (`queued`), commits, then schedules `execute_run(run_id)` as a FastAPI background task and returns 202.
2. `execute_run` opens its **own** session (background tasks outlive the request session), sets
   `status=running`, and calls `analyse_text()`.
3. `build_context()` loads the active Brand Kit: rules in scope (category + department/content-type
   filters), confirmed terms and facts, brand assets, and retrieves up to ~16 evidence chunks
   (14 rule-derived queries + the content head) via pgvector.
4. Deterministic candidates are produced first, then `reviewer_candidates()` fans out six reviewers ×
   `LLM_REPEAT_RUNS` on a `ThreadPoolExecutor(6)`. A failing reviewer is logged and skipped; the run
   continues.
5. `merge_findings()` clusters same-reviewer/same-category candidates by span IoU ≥ 0.5, chooses the
   representative (deterministic > severity > span length), computes agreement/evidence/confidence, forces
   `label=confirmed` for deterministic or direct-contradiction clusters, drops suggestions that escape the
   span, and sorts by severity.
6. Findings are persisted with rule id/version, provider, model, prompt version and the score inputs;
   `stats` records counts, duplicates merged, injection scan, duration.
7. `status=complete`, `finished_at` set. On any exception the run is marked `failed` with the error text so
   the UI can explain it instead of hanging.

## Retrieval & chunking

`services/retrieval.chunk_text()` produces 300–500 token, sentence-aligned windows with ~60 token overlap
and never emits a chunk over the maximum (a short tail is merged forward only when it still fits). Each
chunk keeps page number and the last numbered section heading. Embeddings live in `chunks.embedding`
(JSON, portable) and, on Postgres, are mirrored into `chunk_vectors(embedding vector(1536))` with an
IVFFlat cosine index. SQLite falls back to in-process cosine similarity over the same vectors, so
behaviour is identical in tests and demos.

## Frontend data flow

* `AuthProvider` holds `/auth/me` (role + permission flags) and redirects to `/login` when there is no
  token.
* Each page loads its own data; the Review Report polls the run every 900 ms while `queued|running`.
* Highlighting works on the server-provided `span_start`/`span_end` character offsets: `DocumentView` cuts the
  text at every span boundary, and where spans overlap the most severe wins visually. Applying a suggestion
  renders an inline tracked change (`<del>`/`<ins>`) in the browser session only — nothing is saved until a
  human records a decision and adds a version.
* Design tokens live once, in `tailwind.config.js` + `app/globals.css` (`--royal-navy`, `--gold`, …). Brand art
  is original inline SVG in `app/components/brand/` (crest, patterns, six reviewer avatars, Sentri the owl,
  seals) — no external requests at runtime; fonts are self-hosted via `next/font`. Severity is never colour
  alone: every chip carries a glyph and a word, and highlighted spans carry distinct underline styles.
* `PrefsProvider` stores two browser-only preferences (dark theme, "Show characters"). Turning characters off
  hides the avatars and mascot; every fact they carry is also present as text.
* Every mutation surfaces the API's error message through the toast system — no silent failures.

## Failure modes considered

| Failure | Behaviour |
|---|---|
| One reviewer crashes / model errors | Logged, that reviewer contributes nothing, other five still report; run completes |
| Model returns invalid JSON | Hosted adapter drops invalid findings during Pydantic validation; local engine is typed end to end |
| Model invents a citation | Citation is dropped unless it resolves to a retrieved chunk bearing on the span → UI shows “No approved source found” |
| Suggestion rewrites the whole document | Dropped (span-locality check) |
| Analysis still running when submitting | `409` with the current status |
| Upload too large / wrong type | `413` / `415` before anything is stored |
| Token for another org | `404` (never `403`), so existence does not leak |
| Background task dies | `recover_stale_runs()` marks anything stuck in `queued`/`running` for >15 min as `failed` with an "Abandoned… re-run" message, at startup and before each new run. Never auto-requeued: re-running a hosted model spends money |
| Production started with dev defaults | `settings.assert_production_safe()` raises at startup and lists every problem; the port never opens |
| Login / upload hammered | `429` with `Retry-After` from the per-IP limiter |

## The learning loop, concretely

A manager dismissing a finding is a **signal**, never an automatic rule change. The flow is:

```
finding dismissed (reason required)
        │
        ▼
learning prompt: "Make this an approved rule?"   →  No  → override.declined (audit entry, nothing changes)
        │ Yes
        ▼
scope chosen: global | one department | one content type
        │
        ├── legal / accessibility  →  status pending_approval  →  an Approver must click promote
        └── everything else        →  promoted immediately
        ▼
new RuleVersion(body = "Exception: “<span>” is permitted in <scope>. Manager reason: …")
old version → status superseded (never deleted)   •   audit entry rule.promoted
        ▼
labelled-set regression run (53 samples) → regressions flagged if any reviewer F1 drops > 0.05
        ▼
next review: build_context loads only the exceptions whose scope matches this content,
             apply_exceptions drops matching candidates, stats.exceptions_applied counts them
```

Two design choices worth calling out:

* **Scoped exceptions never weaken the general rule.** A carve-out for `content type = ad` is stored as a
  *sibling* rule (`TERM-001-AD`) with that narrow scope, so `TERM-001` keeps its full strength for blog
  posts, emails and social. An organisation-wide exception appends a new version to the original rule
  instead, so the rule text itself records what is now permitted.
* **The benchmark does not count learned policy.** `eval.run_eval` calls `analyse_text(...,
  honour_exceptions=False)` so the published precision/recall measures how the reviewers read the written
  brand rules. Approved exceptions are exercised by the app and by the post-promotion regression run.

Reverting works the same way as any rule: `POST /rules/{id}/revert/{version}` appends a copy of the older
body as a new version, with author, date, scope and reason.
