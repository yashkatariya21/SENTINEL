# ---- build stage ----------------------------------------------------------
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# libgomp1 is needed by PyMuPDF; tesseract is optional (OCR_ENABLED=1)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Non-root user; the storage directory must be writable by it.
RUN useradd --create-home --uid 10001 sentinel \
    && mkdir -p /app/storage \
    && chown -R sentinel:sentinel /app
USER sentinel

ENV STORAGE_DIR=/app/storage \
    PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

# One worker per container; scale horizontally behind the platform.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
