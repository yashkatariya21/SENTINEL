# Sentinel AI — quickstart

Everything is here: the FastAPI backend, the Next.js frontend, a seeded demo database, the docs,
the evaluation report, and Docker / Render / Vercel configs.

**The order of the door:** the public link opens the **brief** at `/` → the **sign-in** at `/login` →
the **desk** at `/desk`. The sign-in is a step, always shown; the desk and every other room are behind it.
Architecture, in one picture: [`docs/images/architecture.svg`](docs/images/architecture.svg).

---

## 1. FastAPI backend (Python 3.11+)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate      # optional but recommended
pip install -r requirements.txt

python3 -m seed.seed          # builds sentinel.db + the fictional Northwind workspace (16 items)
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

* API docs: <http://localhost:8000/docs> · health: <http://localhost:8000/health>
* Defaults are safe: SQLite plus the offline AI engine, so **no key and no spend**.
* `sentinel.db` and `storage/` ship populated, so you can skip `seed.seed` if you want the exact demo
  state in this archive. The seed is idempotent — running it twice creates nothing.

## 2. Next.js frontend (Node 18+)

```bash
cd frontend
npm install
API_URL=http://127.0.0.1:8000 npm run dev      # http://localhost:3000
```

The browser only ever calls its own origin: `next.config.js` rewrites `/v1/*` to `API_URL`, so there is no
CORS setup and no API key in the client. `API_URL` is read **at build time** — set it before
`next build`/`next start` too, or every API call 500s and the app looks broken (the build warns).

## 3. Walk in

Open <http://localhost:3000> — that is **the brief**, and it needs no session. Press **Open the workspace**,
then sign in. Password for every seeded user: `Sentinel!2026` (or `SEED_PASSWORD` if you set one; the demo
“View as” switcher needs no password at all, because it asks `POST /v1/demo/session` for that role's token).

| Email | Name | Role | What they can do |
|---|---|---|---|
| `ananya@northwind.example` | Ananya Iyer | Admin | everything; confirms Brand Kit proposals, manages users |
| `meera@northwind.example` | Meera Krishnan | Brand Manager | Brand Kit, rules, guideline changes, analytics, audit |
| `arjun@northwind.example` | Arjun Nair | Approver | approves content; **required** for legal / accessibility rule changes |
| `karan@northwind.example` | Karan Mehta | Manager | reviews team content, dismisses findings, answers the learning prompt |
| `priya@northwind.example` | Priya Raghavan | Manager | second manager, so nobody approves their own item |
| `rhea@northwind.example` | Rhea D'Souza | Creator | submits and sees only their own content |
| `vikram@northwind.example` | Vikram Sethi | Creator | product-team content |
| `nikhil@northwind.example` | Nikhil Verma | External Creator | limited view; external comments only |

## 4. Verify it

```bash
cd backend
python3 -m pytest -q                 # 253 passed
python3 -m eval.run_eval             # precision / recall / FPR vs a single-prompt baseline
python3 -m eval.doc_facts            # fails if README/docs disagree with those runs
```

## 5. Where to read next

| Document | What it answers |
|---|---|
| `README.md` | the product and the engineering: roles, pages, pipeline, formulas, deployment |
| `docs/ARCHITECTURE.md` | the diagram, the door, the request lifecycle, the change ledger, the learning loop, failure modes |
| `docs/API.md` | every endpoint with roles, error codes and the guideline-change queue |
| `docs/PROOF-DESK.md` | the design language: colour, type, contrast measurements, the proof-desk behaviour |
| `docs/EVALUATION.md` | how the 53-sample benchmark works, the held-out set, and what is *not* measured |
| `docs/SECURITY-AND-RESPONSIBLE-AI.md` | prompt-injection defence, no fabricated citations, human gates |
| `docs/DEMO.md` | a ten-minute script for showing the product, plus answers to the hard questions |
| `docs/DEPLOY-VERCEL.md` | deploying both halves, and the gotchas |
| `docs/images/` | screenshots, plus `architecture.svg` / `.png` |

## 6. Deploy

* **Backend**: `render.yaml` (Docker web service + managed Postgres with pgvector) — or `render.demo.yaml`
  for the disposable demo. Set `LLM_API_KEY`, `SECRET_KEY`, `AUTH_*` in the dashboard, never in the repo.
* **Frontend**: Vercel, root directory `frontend`, `API_URL` set **before** the build.
* **Local all-in-one**: `docker compose up --build` (pgvector/pg16 + api + web).
