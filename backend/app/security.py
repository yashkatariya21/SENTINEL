"""Auth, JWT handling, role checks and organisation scoping.

Every endpoint goes through `Principal` (via `CurrentUser`) which carries
org_id + role. Queries are then always filtered by `principal.org_id`; the
helper `scoped()` exists so that forgetting the filter is a visible omission
rather than an easy mistake.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db, set_request_org
from .models import User

ROLES = ("admin", "brand_manager", "approver", "manager", "creator", "external_creator")

# "manager and above" for analytics/audit purposes
MANAGER_ROLES = ("admin", "brand_manager", "approver", "manager")

CAN = {
    "brand_kit:write": ("admin", "brand_manager"),
    "brand_kit:read": ("admin", "brand_manager", "approver", "manager", "creator", "external_creator"),
    "content:create": ("admin", "brand_manager", "approver", "manager", "creator", "external_creator"),
    "content:read_all": ("admin", "brand_manager", "approver", "manager"),
    "analysis:run": ("admin", "brand_manager", "approver", "manager", "creator", "external_creator"),
    "decision:make": ("admin", "brand_manager", "approver", "manager"),
    "approve": ("admin", "brand_manager", "approver", "manager"),
    "override:promote": ("admin", "brand_manager", "manager"),
    "analytics:read": MANAGER_ROLES,
    "audit:read": ("admin", "brand_manager", "approver"),
    "rules:read": ("admin", "brand_manager", "approver", "manager", "creator", "external_creator"),
    "admin:write": ("admin",),
}


def hash_password(password: str, *, salt: str | None = None) -> str:
    salt = salt or os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, salt, digest = stored.split("$")
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return hmac.compare_digest(candidate, digest)


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "org_id": user.org_id,
        "role": user.role,
        "email": user.email,
        "name": user.name,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_ttl_minutes)).timestamp()),
        "iss": "sentinel-ai",
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def _decode_external(token: str) -> dict:
    """Verify a Supabase / Clerk JWT. Requires AUTH_JWKS_URL + AUTH_AUDIENCE."""
    if not settings.auth_jwks_url:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "AUTH_JWKS_URL not configured")
    jwk_client = PyJWKClient(settings.auth_jwks_url)
    signing_key = jwk_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256", "ES256"],
        audience=settings.auth_audience or None,
        options={"verify_aud": bool(settings.auth_audience)},
    )


def decode_token(token: str) -> dict:
    if settings.auth_mode in ("supabase", "clerk"):
        return _decode_external(token)
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm], issuer="sentinel-ai")
    except jwt.PyJWTError as exc:  # pragma: no cover - trivial
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid or expired token: {exc}") from exc


@dataclass
class Principal:
    user_id: str
    org_id: str
    role: str
    email: str
    name: str
    department: str | None = None

    def can(self, permission: str) -> bool:
        return self.role in CAN.get(permission, ())

    def require(self, permission: str) -> None:
        if not self.can(permission):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Role '{self.role}' may not perform '{permission}'.",
            )

    @property
    def is_manager_or_above(self) -> bool:
        return self.role in MANAGER_ROLES


def current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    claims = decode_token(authorization.split(" ", 1)[1].strip())
    user = db.get(User, claims.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    if user.org_id != claims.get("org_id"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token/organisation mismatch")
    # bind the org for Postgres RLS for the rest of this transaction
    set_request_org(db, user.org_id)
    return Principal(
        user_id=user.id, org_id=user.org_id, role=user.role,
        email=user.email, name=user.name, department=user.department,
    )


def require_roles(*roles: str):
    def _dep(principal: Principal = Depends(current_user)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This action requires one of: {', '.join(roles)}.",
            )
        return principal

    return _dep


def require_permission(permission: str):
    def _dep(principal: Principal = Depends(current_user)) -> Principal:
        principal.require(permission)
        return principal
    return _dep


def scoped(query, model, principal: Principal):
    """Apply the organisation filter. Use for every tenant-owned query."""
    return query.filter(model.org_id == principal.org_id)


def get_owned(db: Session, model, obj_id: str, principal: Principal, *, allow_deleted: bool = False):
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "org_id", None) != principal.org_id:
        # 404 not 403: never leak the existence of another tenant's object
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found")
    if not allow_deleted and getattr(obj, "deleted_at", None) is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found")
    return obj
