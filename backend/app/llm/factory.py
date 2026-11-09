"""Adapter factory. One place decides which AI provider the backend talks to."""
from __future__ import annotations

from functools import lru_cache

from ..config import settings
from .base import LLMAdapter
from .local_engine import LocalEngine


@lru_cache
def get_adapter() -> LLMAdapter:
    provider = (settings.llm_provider or "local").lower()
    if provider == "local":
        return LocalEngine()
    if provider in ("openai", "anthropic", "azure_openai", "openai_compatible"):
        if not settings.llm_api_key:
            # Fail loud in logs but keep the product usable: no silent fake AI.
            import logging
            logging.getLogger("sentinel.llm").error(
                "LLM_PROVIDER=%s but LLM_API_KEY is empty; falling back to the local engine.", provider)
            return LocalEngine()
        from .hosted import HostedLLM
        base = settings.llm_base_url
        if provider == "anthropic" and "anthropic" not in base:
            base = "https://api.anthropic.com/v1"
        return HostedLLM(provider if provider != "openai_compatible" else "openai",
                         settings.llm_model, settings.llm_api_key, base)
    import logging
    logging.getLogger("sentinel.llm").error("Unknown LLM_PROVIDER=%s; using local engine.", provider)
    return LocalEngine()


def provider_info() -> dict:
    a = get_adapter()
    return {
        "provider": a.provider_name,
        "model": a.model_name,
        "embedding_model": a.embedding_model,
        "prompt_version": settings.prompt_version,
        "note": "AI calls are made server-side only. Submitted content is treated as data, never instructions.",
    }
