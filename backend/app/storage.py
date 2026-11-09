"""Object storage: local disk in dev, S3-compatible in production.

Uploads are validated on size, MIME type and magic bytes before anything is
written. Original bytes are kept so a document can always be re-extracted.
"""
from __future__ import annotations

import hashlib
import io
import os
import uuid

from fastapi import HTTPException, UploadFile, status

from .config import settings

MAGIC = {
    b"%PDF": "application/pdf",
    b"PK\x03\x04": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    b"\x89PNG": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"RIFF": "image/webp",
}


def sniff_mime(head: bytes) -> str | None:
    for magic, mime in MAGIC.items():
        if head.startswith(magic):
            return mime
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


async def read_upload(file: UploadFile, *, allow: set[str] | None = None) -> tuple[bytes, str]:
    limit = settings.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"File exceeds the {settings.max_upload_mb}MB limit.")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file.")
    declared = (file.content_type or "").lower()
    sniffed = sniff_mime(data[:16])
    mime = sniffed or declared
    allowed = allow or settings.allowed_mimes | {"text/plain"}
    if mime not in allowed:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            f"Unsupported file type '{mime}'. Allowed: {sorted(allowed)}")
    if mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" and not data.startswith(b"PK"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is not a valid DOCX (bad signature).")
    return data, mime


def save_bytes(data: bytes, *, org_id: str, prefix: str, filename: str) -> str:
    digest = hashlib.sha256(data).hexdigest()
    safe = "".join(c for c in filename if c.isalnum() or c in "._-")[:80] or "upload.bin"
    key = f"{org_id}/{prefix}/{uuid.uuid4().hex[:12]}-{safe}"
    if settings.storage_backend == "s3" and settings.s3_bucket:  # pragma: no cover - cloud only
        import boto3
        client = boto3.client("s3", region_name=settings.s3_region)
        client.put_object(Bucket=settings.s3_bucket, Key=key, Body=data)
        return key
    path = os.path.join(settings.storage_dir, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data)
    return key


def read_bytes(key: str) -> bytes:
    if settings.storage_backend == "s3" and settings.s3_bucket:  # pragma: no cover
        import boto3
        client = boto3.client("s3", region_name=settings.s3_region)
        return client.get_object(Bucket=settings.s3_bucket, Key=key)["Body"].read()
    with open(os.path.join(settings.storage_dir, key), "rb") as fh:
        return fh.read()


def delete_bytes(key: str) -> None:
    if not key:
        return
    if settings.storage_backend == "s3" and settings.s3_bucket:  # pragma: no cover
        import boto3
        boto3.client("s3", region_name=settings.s3_region).delete_object(
            Bucket=settings.s3_bucket, Key=key)
        return
    path = os.path.join(settings.storage_dir, key)
    if os.path.isfile(path):
        os.remove(path)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
