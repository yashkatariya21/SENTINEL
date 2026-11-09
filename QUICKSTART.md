# Sentinel AI — quickstart for this archive

Everything is here: FastAPI backend, Next.js frontend, seeded demo database, docs, evaluation report,
Docker and Render/Vercel deploy configs.

## 1. FastAPI backend (Python 3.11+)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate      # optional but recommended
pip install -r requirements.txt

python3 -m seed.seed          # builds sentinel.db + the fictional Northwind workspace (16 items)
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

* API docs: http://localhost:8000/docs
* `sentinel.db` and `storage/` are already populated, so you can skip `seed.seed` if you want the
  exact demo state shipped with this archive.

## 2. Next.js frontend (Node 18+)

```bash
cd frontend
npm install
API_URL=http://127.0.0.1:8000 npm run dev      # http://localhost:3000
```

The browser only ever calls its own origin: `next.config.js` rewrites `/v1/*` to `API_URL`, so no CORS
setup and no API key in the client.

## 3. Log in

Password for every demo user: `Sentinel!2026`

| Email | Role | Can do |
|---|---|---|
| `ada@northwind.example` | Admin | everything, confirms Brand Kit proposals, manages users |
| `maya@northwind.example` | Brand Manager | Brand Kit + rules + analytics + audit |
| `raj@northwind.example` | Approver | approves content, and is required for legal/accessibility rule changes |
| `tom@northwind.example` | Manager | approves, dismisses findings, answers the learning prompt |
| `ines@northwind.example` | Manager | second manager (so nobody approves their own work) |
| `leo@northwind.example` | Creator | submits and reviews only their own content |
| `sam@northwind.example` | External Creator | submits only; sees external comments only |

## 4. Verify it

```bash
cd backend
python3 -m pytest -q                 # 54 passed
python3 -m eval.run_eval             # precision/recall/FPR vs a single-prompt baseline
python3 -m eval.run_eval --repeat 3  # micro F1 0.98, false-positive rate 0.00
```

## 5. Where to read next

* `README.md` — full product + engineering documentation (roles, pages, pipeline, formulas, deployment).
* `docs/ARCHITECTURE.md` — request lifecycle, the learning loop, failure handling.
* `docs/API.md` — every endpoint with roles and error codes.
* `docs/EVALUATION.md` — how the 53-sample benchmark works and what it shows.
* `docs/SECURITY-AND-RESPONSIBLE-AI.md` — prompt-injection defence, no fabricated citations, human gates.
* `docs/DEMO.md` — an 8-minute script for showing the product, plus answers to hard questions.

## 6. Deploy

* **Backend**: `render.yaml` (Docker web service + managed Postgres with pgvector). Set `LLM_API_KEY`,
  `SECRET_KEY`, `AUTH_*` in the dashboard — never in the repo.
* **Frontend**: `frontend/vercel.json` (rewrites `/v1/*` to your API URL, adds CSP/security headers).
* **Local all-in-one**: `docker compose up --build` (pgvector/pg16 + api + web).
