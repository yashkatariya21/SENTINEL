"""Auth, workspace setup and user management. Every route is org-scoped."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record
from ..db import get_db
from ..models import Membership, Organisation, User
from ..schemas import LoginIn, TokenOut, UserOut, WorkspaceSetupIn
from ..security import Principal, create_access_token, current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_payload(user: User, org: Organisation) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user),
        user=UserOut(id=user.id, email=user.email, name=user.name, role=user.role,
                     department=user.department),
        organisation={"id": org.id, "name": org.name, "slug": org.slug,
                      "departments": org.department_list or []},
    )


@router.post("/workspace", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def create_workspace(body: WorkspaceSetupIn, db: Session = Depends(get_db)):
    """Create an organisation and its first Admin (workspace setup)."""
    if db.execute(select(Organisation).where(Organisation.slug == body.slug)).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "That workspace slug is already taken.")
    org = Organisation(name=body.org_name, slug=body.slug, department_list=body.departments)
    db.add(org)
    db.flush()
    admin = User(org_id=org.id, email=body.admin_email.lower(), name=body.admin_name,
                 role="admin", department=(body.departments or [None])[0],
                 password_hash=hash_password(body.admin_password))
    db.add(admin)
    db.flush()
    db.add(Membership(org_id=org.id, user_id=admin.id, role="admin"))
    record(db, org_id=org.id, action="org.created", actor_id=admin.id, actor_role="admin",
           entity="organisation", entity_id=org.id, detail={"name": org.name})
    db.commit()
    return _token_payload(admin, org)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == body.email.lower().strip())).scalars().first()
    if user is None:
        org = db.execute(select(Organisation).where(Organisation.slug == body.email.lower())).scalars().first()
        if org is not None:
            user = db.execute(select(User).where(User.org_id == org.id, User.role == "admin")).scalars().first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is deactivated.")
    org = db.get(Organisation, user.org_id)
    if org is None or org.deleted_at is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Organisation is not available.")
    record(db, org_id=org.id, action="auth.login", actor_id=user.id, actor_role=user.role,
           entity="user", entity_id=user.id)
    db.commit()
    return _token_payload(user, org)


@router.get("/me")
def me(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    org = db.get(Organisation, principal.org_id)
    return {
        "user": {"id": principal.user_id, "email": principal.email, "name": principal.name,
                 "role": principal.role, "department": principal.department},
        "organisation": {"id": org.id, "name": org.name, "slug": org.slug,
                         "departments": org.department_list or []},
        "permissions": {
            "can_write_kit": principal.can("brand_kit:write"),
            "can_approve": principal.can("approve"),
            "can_promote": principal.can("override:promote"),
            "can_read_analytics": principal.can("analytics:read"),
            "can_read_audit": principal.can("audit:read"),
            "can_manage_users": principal.can("admin:write"),
        },
    }


@router.get("/users", response_model=list[UserOut])
def list_users(principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(User).where(User.org_id == principal.org_id)).scalars().all()
    return [UserOut(id=u.id, email=u.email, name=u.name, role=u.role, department=u.department)
            for u in rows]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: dict, principal: Principal = Depends(current_user), db: Session = Depends(get_db)):
    principal.require("admin:write")
    email = (body.get("email") or "").lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A valid email is required.")
    role = body.get("role") or "creator"
    if role not in ("admin", "brand_manager", "approver", "manager", "creator", "external_creator"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown role.")
    if db.execute(select(User).where(User.org_id == principal.org_id, User.email == email)).scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "That email already exists in this workspace.")
    user = User(org_id=principal.org_id, email=email, name=body.get("name") or email.split("@")[0],
                role=role, department=body.get("department"),
                password_hash=hash_password(body.get("password") or "Sentinel!2026"))
    db.add(user)
    db.flush()
    db.add(Membership(org_id=principal.org_id, user_id=user.id, role=role))
    record(db, org_id=principal.org_id, action="user.created", actor_id=principal.user_id,
           actor_role=principal.role, entity="user", entity_id=user.id, detail={"role": role})
    db.commit()
    return UserOut(id=user.id, email=user.email, name=user.name, role=user.role, department=user.department)
