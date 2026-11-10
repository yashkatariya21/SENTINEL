"""Database engine + session handling.

Production: PostgreSQL 16 + pgvector.
Local/demo : SQLite (same ORM, embeddings stored as JSON and scored in-process).

Row-level security: app-level scoping is enforced in every query via
`org_scoped()` / the auth dependency *and* Postgres RLS policies are installed
by `migrations/rls.sql`. Defence in depth - either layer alone would stop a
cross-tenant read, both together are what we ship.
"""
from __future__ import annotations

import logging

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _make_engine():
    if settings.is_postgres:
        eng = create_engine(settings.database_url, pool_pre_ping=True, future=True)
    else:
        eng = create_engine(
            settings.database_url,
            connect_args={"check_same_thread": False},
            future=True,
        )

        @event.listens_for(eng, "connect")
        def _sqlite_pragmas(dbapi_conn, _rec):  # pragma: no cover - driver glue
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

    return eng


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def set_request_org(db: Session, org_id: str | None) -> None:
    """Bind the org to the DB session so Postgres RLS policies can enforce it.

    `SET LOCAL` is transaction-scoped, so it is re-issued per request by the
    auth dependency. On SQLite this is a no-op (RLS is Postgres-only).
    """
    if not settings.is_postgres:
        return
    db.execute(text("SELECT set_config('app.current_org', :org, true)"), {"org": org_id or ""})


# Columns added after the first release. `create_all` never alters an existing table,
# so each one is added explicitly when it is missing. Both SQLite and PostgreSQL accept
# `ALTER TABLE ... ADD COLUMN` for a nullable/JSON column with a default.
ADDED_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ("findings", "metrics", "JSON"),
    ("analysis_runs", "metrics", "JSON"),
)


def _add_missing_columns() -> None:
    from sqlalchemy import inspect

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, column, sql_type in ADDED_COLUMNS:
            if table not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table)}
            if column in present:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}"))
            logging.getLogger("sentinel.db").info("added column %s.%s", table, column)


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)

    Base.metadata.create_all(engine)
    _add_missing_columns()
    if settings.is_postgres:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            rls_path = __import__("pathlib").Path(__file__).resolve().parent.parent / "migrations" / "rls.sql"
            if rls_path.exists():
                for stmt in [s for s in rls_path.read_text().split("-- >>>") if s.strip()]:
                    conn.execute(text(stmt))
