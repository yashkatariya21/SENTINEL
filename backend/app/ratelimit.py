"""Small dependency-free sliding-window rate limiter.

Enough for login, upload and the demo endpoints: it keys on (bucket, client IP) and
counts calls in the last 60 seconds. In-process state is deliberate — a single API
process is the deployment shape here; behind multiple replicas put the same limits at
the edge (Render/Vercel) or back this with Redis.
"""
from __future__ import annotations

import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status

_WINDOW_SECONDS = 60.0
_lock = threading.Lock()
_hits: dict[tuple[str, str], deque[float]] = {}


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hit(bucket: str, request: Request, limit: int) -> None:
    """Record a call, raising 429 when the bucket is over its per-minute budget."""
    if limit <= 0:
        return
    key = (bucket, client_ip(request))
    now = time.monotonic()
    with _lock:
        window = _hits.setdefault(key, deque())
        while window and now - window[0] > _WINDOW_SECONDS:
            window.popleft()
        if len(window) >= limit:
            retry_after = int(_WINDOW_SECONDS - (now - window[0])) + 1
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Too many requests. Try again in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )
        window.append(now)


def reset(bucket: str | None = None) -> None:
    """Clear limiter state (used by tests)."""
    with _lock:
        if bucket is None:
            _hits.clear()
        else:
            for key in [k for k in _hits if k[0] == bucket]:
                _hits.pop(key, None)
