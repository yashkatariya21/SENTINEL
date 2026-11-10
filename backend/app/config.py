"""Configuration. Every secret and deployment knob comes from the environment."""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- core -------------------------------------------------------------
    app_name: str = "Sentinel AI"
    env: str = os.getenv("SENTINEL_ENV", "development")
    api_prefix: str = "/v1"

    # Postgres + pgvector in production, e.g.
    #   postgresql+psycopg://user:pass@host:5432/sentinel
    # SQLite is the zero-dependency local/demo fallback.
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./sentinel.db")

    secret_key: str = os.getenv("SECRET_KEY", "dev-only-insecure-change-me")
    # Set this in any deployment that is not a laptop. Production refuses to start
    # with the development secret or with seeding enabled (see `assert_production_safe`).
    prod_secret_min_length: int = 32
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = int(os.getenv("ACCESS_TOKEN_TTL_MINUTES", "720"))

    # Supabase / Clerk: when AUTH_MODE != "local" the JWT is verified against
    # the provider JWKS / secret; local mode issues its own HS256 tokens.
    auth_mode: str = os.getenv("AUTH_MODE", "local")  # local | supabase | clerk
    auth_jwks_url: str = os.getenv("AUTH_JWKS_URL", "")
    auth_audience: str = os.getenv("AUTH_AUDIENCE", "")

    # --- object storage ---------------------------------------------------
    storage_backend: str = os.getenv("STORAGE_BACKEND", "local")  # local | s3
    storage_dir: str = os.getenv("STORAGE_DIR", "./storage")
    s3_bucket: str = os.getenv("S3_BUCKET", "")
    s3_region: str = os.getenv("S3_REGION", "")
    max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "20"))
    allowed_mime: str = (
        "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,"
        "text/plain,image/png,image/jpeg,image/webp"
    )

    # --- AI provider (provider-agnostic adapter) --------------------------
    # "local" = deterministic offline engine, no third-party calls, no cost.
    # "openai" / "anthropic" = hosted LLM + embeddings, called only server-side.
    llm_provider: str = os.getenv("LLM_PROVIDER", "local")
    llm_model: str = os.getenv("LLM_MODEL", "sentinel-local-1")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "sentinel-hash-embed-1")
    llm_api_key: str = os.getenv("LLM_API_KEY", "")  # never logged, never returned
    llm_base_url: str = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
    llm_repeat_runs: int = int(os.getenv("LLM_REPEAT_RUNS", "3"))
    prompt_version: str = "p2026-11-09.1"

    # --- parsing ----------------------------------------------------------
    ocr_enabled: bool = os.getenv("OCR_ENABLED", "0") == "1"
    chunk_min_tokens: int = 300
    chunk_max_tokens: int = 500
    chunk_overlap_tokens: int = 60

    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    seed_on_startup: bool = os.getenv("SEED_ON_STARTUP", "1") == "1"

    # --- one-click demo ---------------------------------------------------
    # DEMO_MODE=1 exposes /v1/demo/* (load / status / reset). It is on by default
    # for local runs and switched off in render.yaml for production unless set.
    demo_mode: bool = os.getenv("DEMO_MODE", "1") == "1"
    demo_rate_limit_per_minute: int = int(os.getenv("DEMO_RATE_LIMIT_PER_MINUTE", "3"))
    # the role switcher is clicked far more often than "load demo", so it gets its own budget
    demo_session_rate_limit_per_minute: int = int(
        os.getenv("DEMO_SESSION_RATE_LIMIT_PER_MINUTE", "30"))
    login_rate_limit_per_minute: int = int(os.getenv("LOGIN_RATE_LIMIT_PER_MINUTE", "10"))
    upload_rate_limit_per_minute: int = int(os.getenv("UPLOAD_RATE_LIMIT_PER_MINUTE", "20"))
    demo_analysis_concurrency: int = int(os.getenv("DEMO_ANALYSIS_CONCURRENCY", "4"))

    # password for the seeded demo users; only used when seeding a demo workspace
    seed_password: str = os.getenv("SEED_PASSWORD", "")

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def is_production(self) -> bool:
        return (self.env or "development").lower() in ("production", "prod", "staging")

    def production_problems(self) -> list[str]:
        """Everything that must be fixed before this process may serve real traffic.

        Returned as a list so the operator sees *all* problems at once instead of
        restarting once per mistake.
        """
        problems: list[str] = []
        if not self.is_production:
            return problems
        if self.secret_key in ("", "dev-only-insecure-change-me", "changeme", "test-secret") \
                or len(self.secret_key) < self.prod_secret_min_length:
            problems.append(
                f"SECRET_KEY is the development default or shorter than "
                f"{self.prod_secret_min_length} characters. Anyone with the repository can mint a "
                f"valid token. Set SECRET_KEY to a random value."
            )
        if self.seed_on_startup:
            problems.append("SEED_ON_STARTUP=1 would write demo content into a production database. Set it to 0.")
        if self.demo_mode:
            problems.append(
                "DEMO_MODE=1 exposes /v1/demo/load and /v1/demo/reset, which delete and rebuild content. "
                "Set DEMO_MODE=0."
            )
        if self.database_url.startswith("sqlite"):
            problems.append("DATABASE_URL points at SQLite; production requires PostgreSQL with pgvector.")
        if "*" in self.cors_origins:
            problems.append("CORS_ORIGINS=* allows any origin. List the real origins.")
        if not self.seed_password:
            problems.append(
                "SEED_PASSWORD is empty. Demo credentials must not be hard-coded; set SEED_PASSWORD "
                "or do not seed at all in production."
            )
        return problems

    def assert_production_safe(self) -> None:
        problems = self.production_problems()
        if problems:
            raise RuntimeError(
                "Refusing to start in " + self.env + ":\n  - " + "\n  - ".join(problems)
            )

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgres")

    @property
    def allowed_mimes(self) -> set[str]:
        return {m.strip() for m in self.allowed_mime.split(",") if m.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
