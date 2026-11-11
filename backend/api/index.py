"""Vercel entry point for the FastAPI app (`@vercel/python`).

Vercel imports this module and serves the ASGI `app` object. Two things the runtime does
not do for us:

1. **Import path.** The project root is `backend/`, but the module is imported from inside
   `api/`, so the parent directory has to be on `sys.path` before `app.*` resolves.
2. **Startup.** A serverless container may answer its first request without ever running
   the ASGI lifespan, which is where tables are created, stale runs are recovered and the
   demo workspace is seeded. `bootstrap()` is therefore called here, once per cold start,
   and is idempotent.

Everything is configured by environment variables (see `docs/DEPLOY-VERCEL.md`).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Vercel mounts the filesystem read-only except /tmp; local object storage must live there
# (or use STORAGE_BACKEND=s3 with a bucket). Set before the app reads its settings.
os.environ.setdefault("STORAGE_DIR", "/tmp/sentinel-storage")
os.makedirs(os.environ["STORAGE_DIR"], exist_ok=True)

from app.main import app, bootstrap  # noqa: E402

bootstrap()

# `handler` is what some Vercel Python setups look for; exposing both is harmless.
handler = app

__all__ = ["app", "handler"]
