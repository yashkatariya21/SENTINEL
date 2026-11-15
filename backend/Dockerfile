# ---- build stage ----------------------------------------------------------
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# libgomp1 is needed by PyMuPDF. tesseract-ocr + the English model read the text inside
# uploaded pictures and scanned PDF pages (B1); without them the app still runs, and
# image findings that need OCR simply report "not measured".
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 curl tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Non-root user; the storage directory must be writable by it.
RUN useradd --create-home --uid 10001 sentinel \
    && mkdir -p /app/storage \
    && chown -R sentinel:sentinel /app
USER sentinel

ENV STORAGE_DIR=/app/storage \
    PORT=8000 \
    # OCR on by default in the image, because the binary is right here next to it.
    OCR_ENABLED=1
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

# One worker per container; scale horizontally behind the platform.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
