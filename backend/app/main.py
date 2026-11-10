"""Sentinel AI — FastAPI application.

REST, JSON, versioned under /v1. Every route except auth requires a JWT and is
scoped to one organisation.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import init_db
from .llm.factory import provider_info
from .routers import analytics, auth, brand_kit, content, demo, evaluation, overrides

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("sentinel")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Refuse to serve real traffic with development defaults. Lists every problem at once.
    settings.assert_production_safe()
    init_db()
    from .db import session_scope
    from .services.pipeline import recover_stale_runs

    with session_scope() as db:
        recover_stale_runs(db)
    log.info("Sentinel AI starting: provider=%s model=%s", settings.llm_provider, settings.llm_model)
    if settings.seed_on_startup:
        try:
            from seed.seed import seed_if_empty
            seed_if_empty()
        except Exception as exc:  # demo data must never block the API
            log.warning("seed skipped: %s: %s", type(exc).__name__, exc)
    yield


app = FastAPI(
    title="Sentinel AI",
    version="1.0.0",
    description=(
        "Pre-publication brand governance. Six specialist reviewers check content against the "
        "Brand Kit, every finding cites its rule and evidence, humans decide, and the system "
        "learns from manager decisions. It reviews and explains; it never publishes, auto-fixes, "
        "or changes a rule without a manager's click."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.cors_origins == "*" else [o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):  # pragma: no cover - safety net
    log.exception("unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal error. The event was logged."})


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name, "env": settings.env,
            "database": "postgres+pgvector" if settings.is_postgres else "sqlite",
            "ai": provider_info()}


for module in (auth, brand_kit, content, overrides, analytics, demo, evaluation):
    app.include_router(module.router, prefix=settings.api_prefix)


@app.get(settings.api_prefix + "/meta")
def meta():
    """Public metadata for the UI: what the system does and does not do."""
    return {
        "product": "Sentinel AI",
        "version": "1.0.0",
        "roles": ["admin", "brand_manager", "approver", "manager", "creator", "external_creator"],
        "reviewers": [
            {"key": "brand_voice", "label": "Brand Voice", "job": "Tone and style against the guideline"},
            {"key": "terminology", "label": "Terminology", "job": "Approved vs. banned words"},
            {"key": "fact_checker", "label": "Fact Checker", "job": "Claims vs. approved documents"},
            {"key": "visual", "label": "Visual", "job": "Logo version, colours, fonts, ratio, quality"},
            {"key": "accessibility", "label": "Accessibility", "job": "Contrast, text size, alt text, readable font"},
            {"key": "legal", "label": "Legal", "job": "Risky claims without proof (AI risk perspective, not legal advice)"},
        ],
        "content_types": ["social_post", "blog", "ad", "email"],
        "ai": provider_info(),
        "guarantees": [
            "Never publishes content.",
            "Never auto-fixes content: suggestions change only the flagged span.",
            "Never changes a rule without a manager's click.",
            "Never fabricates a citation: findings without a source say 'No approved source found'.",
            "Nobody approves their own content item.",
            "Legal and accessibility rule changes require an Approver.",
        ],
    }
