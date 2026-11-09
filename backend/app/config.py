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

    class Config:
        env_file = ".env"
        extra = "ignore"

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
