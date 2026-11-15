# Deploying Sentinel AI on Vercel (frontend **and** backend)

Two Vercel projects, one Postgres. This guide is written for the two URLs in play:

| Project | URL you gave | Use this instead (production domain) |
|---|---|---|
| Backend (FastAPI) | `sentinel-zzrk-axj466npu-inkoolm-hackathon.vercel.app` | `sentinel-zzrk-inkoolm-hackathon.vercel.app` |
| Frontend (Next.js) | `sentinel-g0n9ucjzd-inkoolm-hackathon.vercel.app` | `sentinel-inkoolm-hackathon.vercel.app` |

**Why swap them:** a URL with that extra 9-character chunk (`axj466npu`, `g0n9ucjzd`) is a
*deployment* URL. It changes on every push, and on team accounts it is behind Vercel
Deployment Protection, so a server-to-server call gets an HTML login page instead of JSON.
Take the stable domain from **Vercel → project → Settings → Domains** and use that. If your
production domain looks different from the guess above, use yours — the shape is
`<project>-<team>.vercel.app`.

Everything below is configured by environment variables; nothing needs a code change.

---

## 0. What is different from running it locally

Three things break on Vercel if you keep the local defaults. All three are handled by the
env file, but you should know *why*:

| Local default | On Vercel | What to do |
|---|---|---|
| `DATABASE_URL=sqlite:///./sentinel.db` | The filesystem is read-only except `/tmp`, and `/tmp` is per-instance and wiped. Rows vanish between requests → the demo looks empty, then half-loaded | **Use PostgreSQL with pgvector** (Neon, Supabase, Railway, Render) |
| `STORAGE_DIR=./storage` | Same read-only problem: uploads and the seeded guideline fail to write | `STORAGE_DIR=/tmp/sentinel-storage` (fine for a demo) or `STORAGE_BACKEND=s3` |
| `POST /v1/demo/load?background=true` | A background job runs in a worker thread that is frozen the moment the response is sent | The UI now calls it **synchronously**; the offline engine finishes the workspace in a few seconds |

---

## Which path to pick

| | **A — Backend on Render, frontend on Vercel** ⭐ | **B — Both on Vercel** |
|---|---|---|
| Effort | ~10 min, one blueprint file + one frontend env var | ~10 min, but more moving parts |
| Runtime | normal long-lived process: background jobs, process-wide rate limits, no timeouts | serverless functions: cold starts, request ceilings |
| Cost | free (sleeps after ~15 min idle; ~50 s to wake) | free |
| Best for | **a judged demo you link from a submission** | a purely static-ish showcase |

Path A is recommended: this app was written as one API process, and Render runs it that way.
The blueprint for it is `render.demo.yaml` (the default `render.yaml` is the *hardened
production* config and deliberately turns the demo off — do not use it for judging).

### Path A, in order

1. **Render → New → Blueprint** → pick this repo → **Blueprint Path: `render.demo.yaml`** → Apply.
   It creates `sentinel-demo-api` (Docker, free) + `sentinel-demo-db` (Postgres 16, free; pgvector
   is supported — `CREATE EXTENSION vector` runs at boot).
2. When it deploys, open `https://sentinel-demo-api.onrender.com/health`. You want
   `"database": "postgres+pgvector"`, `"demo_mode": true`, `"rls": {"applied": true}`.
3. **Vercel → frontend project → Settings → Environment Variables**:
   `API_URL=https://sentinel-demo-api.onrender.com` → **Redeploy** (build-time, see below).
4. In Render, set `CORS_ORIGINS` to the Vercel domain (Render redeploys itself).
5. Open the Vercel URL and press **Load demo data** once (see the checklist at the end).

Everything from §1 (database) onwards is for **Path B**; on Path A skip §1–§3 entirely.

## 1. Create the database (5 minutes, free)

Any managed Postgres with **pgvector** works. Neon is the quickest:

1. <https://neon.tech> → **New project** → pick the region closest to your Vercel region
   (`ap-south-1` / Mumbai if your users are in India — keep Vercel in `bom1` too).
2. Copy the **pooled** connection string (host contains `-pooler`).
3. Change the scheme from `postgresql://` to `postgresql+psycopg://`:

```
postgresql://user:pass@ep-cool-1234-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require
                ↓
postgresql+psycopg://user:pass@ep-cool-1234-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require
```

`postgresql+psycopg://` is still the safest thing to paste, but you no longer have to edit the
string: the app rewrites `postgres://` and `postgresql://` to the psycopg driver at startup
(`Settings._driver_for_postgres`). The failure it prevents — `ModuleNotFoundError: psycopg2` on
every request — therefore cannot happen from a copy-pasted URL.

**pgvector:** the API runs `CREATE EXTENSION IF NOT EXISTS vector` on boot. On Neon the
project owner is allowed to, so nothing else is needed. On Supabase run it once in the SQL
editor: `create extension if not exists vector;`. Check `GET /health` afterwards — it reports
`"database": "postgres+pgvector"` when it is talking to Postgres.

---

## 2. Backend project on Vercel

The repo already contains what Vercel's Python runtime needs:

* `backend/vercel.json` — builds `api/index.py` with `@vercel/python` and routes every path to it.
* `backend/api/index.py` — puts the project root on `sys.path`, sets `STORAGE_DIR` to `/tmp`,
  imports the ASGI app and calls `bootstrap()` once per cold start. `bootstrap()` is what
  creates tables, the vector mirror, the RLS policies and the demo workspace — a serverless
  container can answer a request *without* running the ASGI startup event, so relying on the
  lifespan alone would leave you with an empty database.
* `backend/.vercelignore` — keeps `tests/`, `eval/`, `*.db`, `storage/` out of the bundle.

**Steps**

1. **Add New → Project** → import this repo → **Root Directory: `backend`**.
2. Framework preset: **Other** (do not pick Python or FastAPI templates; `vercel.json` decides).
3. Add the environment variables from `backend/.env.vercel.example` (§3 below).
4. **Deploy.**

---

## 3. Backend environment variables

Copy-paste list (CLI). Replace the two placeholders first:

```bash
# in the repo, on your machine
cd backend
vercel link                     # choose the backend project
openssl rand -hex 32            # → paste as SECRET_KEY

vercel env add DATABASE_URL production      # postgresql+psycopg://… (see §1)
vercel env add SECRET_KEY production        # the 64 hex chars

# demo-visible mode (correct for a hackathon judging link)
vercel env add SENTINEL_ENV production      # value: development
vercel env add DEMO_MODE production         # value: 1
vercel env add SEED_ON_STARTUP production   # value: 1

vercel env add LLM_PROVIDER production      # value: local
vercel env add STORAGE_BACKEND production   # value: local
vercel env add STORAGE_DIR production       # value: /tmp/sentinel-storage
vercel env add CORS_ORIGINS production      # value: https://<your-frontend-production-domain>
vercel env pull                             # optional: sanity-check what you set
```

Or paste the same values into **Settings → Environment Variables** (Production, Preview,
Development). Table form, with the reason for each:

| Variable | Value for a public demo | Why |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://…` | required; SQLite cannot persist here |
| `SECRET_KEY` | 64 random hex chars | signs JWTs; production guard rejects defaults |
| `SENTINEL_ENV` | `development` | **guards off**. See the warning below |
| `DEMO_MODE` | `1` | exposes `/v1/demo/load`, `/status`, `/session`, `/reset` |
| `SEED_ON_STARTUP` | `1` | writes the Brand Kit + 16 starter submissions on first boot |
| `LLM_PROVIDER` | `local` | deterministic, offline, zero cost — no API key |
| `STORAGE_BACKEND` / `STORAGE_DIR` | `local` / `/tmp/sentinel-storage` | the only writable path on Vercel |
| `CORS_ORIGINS` | your frontend origin | required by the production guard; protects direct API calls |
| `ACCESS_TOKEN_TTL_MINUTES` | `720` | 12-hour sessions for a demo |
| `DEMO_RATE_LIMIT_PER_MINUTE` | `3` | per IP, per minute |

> **⚠ `SENTINEL_ENV=development` is a deliberate downgrade.** It is what keeps the
> “Load demo data” button working, because `SENTINEL_ENV=production` *refuses to boot* with
> `DEMO_MODE=1` (that route can rebuild and delete demo content). Consequence: on a public
> URL anyone can call `POST /v1/demo/reset` and `POST /v1/demo/session`. That is fine for a
> judged demo with disposable data, and unacceptable for anything real. For a production
> deployment use `SENTINEL_ENV=production`, `DEMO_MODE=0`, `SEED_ON_STARTUP=0` and no
> `SEED_PASSWORD` — the guards then verify the other five conditions for you.

### Verify the backend before touching the frontend

```bash
curl https://<backend-domain>/health
# {"status":"ok", "database":"postgres+pgvector", "demo_mode":true, "env":"development",
#  "rls":{"applied":true,"statements":12,"skipped":[],"error":null}, ...}

curl -X POST https://<backend-domain>/v1/demo/load?background=false   # ~5 s, returns state:done
curl https://<backend-domain>/v1/demo/status
curl -X POST https://<backend-domain>/v1/demo/session | head -c 120   # an access_token means the demo can sign in
```

`https://<backend-domain>/docs` should also render the OpenAPI UI.

If `/health` returns 500, the function is crashing on boot — check **Deployments → Functions
→ Logs**. The two usual causes are a bad `DATABASE_URL` and a guard failure (the error message
lists every unmet condition at once).

---

## 4. Frontend project on Vercel

1. **Add New → Project** → same repo → **Root Directory: `frontend`**.
2. Framework preset: **Next.js** (detected).
3. Environment variables (all three environments):

| Variable | Value | Notes |
|---|---|---|
| `API_URL` | `https://<backend-production-domain>` | **build-time** — see the warning |
| `NEXT_PUBLIC_SITE_URL` | `https://<frontend-production-domain>` | metadata, OG image, canonical links |

```bash
cd frontend
vercel link
vercel env add API_URL production              # https://<backend-production-domain>
vercel env add NEXT_PUBLIC_SITE_URL production # https://<frontend-production-domain>
```

> **⚠ `API_URL` is read at build time, not at runtime.** `next.config.js` compiles the
> `/v1/*` rewrite into the build. If you set or change `API_URL` and do not redeploy, the
> proxy still points at the old target — the browser then sees `500` on every API call and the
> app looks broken. **Deployments → ⋯ → Redeploy** after any change. A build without
> `API_URL` now prints `[sentinel] API_URL is not set at build time…` in the build log.

The browser only ever calls its own origin (`/v1/...`); Next proxies to `API_URL`. That keeps
the API origin out of the bundle, avoids CORS entirely and means the token never leaves a
same-origin request.

---

## 4a. Before you submit the link (do this, in order)

A link is only as good as its first 60 seconds. Five checks, ten minutes:

1. **Warm the backend.** If the API sleeps (Render free), open `https://<backend>/health` and
   wait for JSON. A judge who is the first visitor after idle sees ~50 s of nothing.
2. **Load the demo once yourself.** On the frontend URL press **Load demo data** and let it
   finish. A judge then lands on a workspace that is already full; the button stays a no-op
   that reports "already loaded".
3. **Open the link in a private window** (no session, no cache) and click through: `/login` →
   **Load demo data** → a review report → **View as** → Creator → `/analytics` → `/evaluation`.
   If that works signed-out, it works for a judge.
4. **Check the phone.** 390 px wide: the rail collapses, the demo card stays tappable.
5. **Write the demo credentials into the submission** — there are none to leak: the role
   switcher mints a token server-side. Say that, because judges expect to see a password.

Two things you must not claim in the submission: that LLM quality is measured (it is not —
`/evaluation` labels it), and that CI is green (the workflow exists but has never run).

## 5. End-to-end check (2 minutes)

1. Open the frontend URL → `/login` renders with the gold/navy charter panel.
2. Press **Load demo data**. Expect: a few seconds of “Preparing Northwind…”, then a redirect
   to a review report signed in as **Karan Mehta — Manager**.
3. Header **View as** → pick **Rhea D'Souza — Creator**: the rail loses Analytics/Audit and the
   greeting changes. That exercises `POST /v1/demo/session` (no password anywhere).
4. `/analytics` shows a Brand Score ring, `/evaluation` shows what is and is not measured,
   `/content/<id>/report.pdf` downloads a PDF.
5. `curl https://<backend>/health` → `"rls": {"applied": true, …}`.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Every API call returns **500**, page renders but empty | `API_URL` unset at build time → proxy targets `127.0.0.1:8000` | set `API_URL` in the frontend project, **redeploy** |
| The proxy returns an **HTML login page / 401** instead of JSON | backend URL is a preview deployment with Vercel Deployment Protection | use the production domain, or Settings → Deployment Protection → disable for that project |
| `ModuleNotFoundError: psycopg2` | `DATABASE_URL` starts `postgresql://` | use `postgresql+psycopg://` |
| `Refusing to start in production: …` in the function log | guards found a problem (listed in the message) | fix the listed variables — e.g. demo on a production env |
| `/health` 200 but `database: sqlite` | `DATABASE_URL` not set in that environment (Preview?) | set it for **all** environments, redeploy |
| Demo loads, then data disappears / half-empty workspace | SQLite on an ephemeral filesystem | use Postgres |
| `expected 1536 dimensions, not 256` | fixed: the pgvector mirror is now created at the provider's dimension (256 for the offline engine) | set `LLM_PROVIDER=local` and redeploy; boot rebuilds the mirror |
| `syntax error at or near "DO $"` at boot | fixed: `migrations/rls.sql` is now parsed with a dollar-quote-aware splitter | redeploy this version |
| Uploads 500 but analysis works | writing to a read-only path | `STORAGE_DIR=/tmp/sentinel-storage`, or S3 |
| First request after idle takes ~10 s | serverless cold start (importing FastAPI + PyMuPDF) | expected; hit `/health` to warm it before a demo |
| 429 “Too many requests” | rate limits are per IP: 3 demo loads, 10 logins, 20 uploads a minute | wait a minute, or raise the limits |

---

## 7. What this deployment shape does **not** give you

Stated plainly, because the alternative is finding out during a demo:

* **Uploads and the seeded guideline are ephemeral.** They live in `/tmp` for the life of an
  instance. Findings, rules and citations are in Postgres and survive; re-downloading an
  original file after the instance recycles may 404. Use S3 for anything permanent.
* **Rate limiting is in-process.** Each serverless instance keeps its own counters, so the
  effective limit is *per instance*, not global. Put real limits at the edge for production.
* **The demo loader is synchronous.** That is deliberate (see §0) and it finishes in seconds
  on the offline engine; a hosted LLM provider reviewing 57 submissions would exceed a
  serverless timeout, so keep `LLM_PROVIDER=local` for the demo.
* **No cron, no queue, no websockets.** The product does not need them; the review report
  polls a normal HTTP endpoint.
* **CI has never run on GitHub Actions.** `.github/workflows/ci.yml` exists and is valid
  YAML, but no run has been observed — do not quote a green badge you have not seen.
* **LLM quality is not measured.** `/evaluation` reports rule-engine numbers (0.98 micro F1 on
  the regression set; 0.29 strict / 0.50 relaxed on the held-out set) and states that the
  hosted-model evaluation has not been run. Keep that framing.
