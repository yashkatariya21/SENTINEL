"""Database engine + session handling.

Production: PostgreSQL 16 + pgvector.
Local/demo : SQLite (same ORM, embeddings stored as JSON and scored in-process).

Row-level security: app-level scoping is enforced in every query via
`org_scoped()` / the auth dependency *and* Postgres RLS policies are installed
by `migrations/rls.sql`. Defence in depth - either layer alone would stop a
cross-tenant read, both together are what we ship.
"""
from __future__ import annotations

import contextvars
import logging
import re

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _normalise_pg_url(url: str) -> str:
    """Ensure the URL uses the psycopg3 dialect (postgresql+psycopg://).

    Render and many platforms supply a plain `postgresql://` or `postgres://` URL.
    SQLAlchemy routes those to psycopg2 by default; we only ship psycopg3.
    """
    for prefix in ("postgresql+psycopg2://", "postgresql+psycopg://", "postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def _make_engine():
    if settings.is_postgres:
        eng = create_engine(_normalise_pg_url(settings.database_url), pool_pre_ping=True, future=True)
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


# When work runs outside a request (seeding, the demo loader's worker thread, maintenance),
# nothing has told Postgres which organisation the session may touch. `bound_org()` carries
# it, so a session created inside that block can set `app.current_org` for RLS policies.
_CURRENT_ORG: contextvars.ContextVar[str | None] = contextvars.ContextVar("sentinel_org", default=None)


@contextmanager
def bound_org(org_id: str | None) -> Iterator[None]:
    token = _CURRENT_ORG.set(org_id)
    try:
        yield
    finally:
        _CURRENT_ORG.reset(token)


@contextmanager
def session_scope() -> Iterator[Session]:
    db = SessionLocal()
    org = _CURRENT_ORG.get()
    if org and settings.is_postgres:
        set_request_org(db, org)
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


# What happened the last time the RLS migration ran. Surfaced by /health so a deployment
# whose database role is not allowed to provision policies says so instead of pretending.
RLS_STATUS: dict[str, object] = {"applied": False, "statements": 0, "skipped": [], "error": None}

_RLS_MARKER = re.compile(r"^\s*--\s*>>>\s?")


def _split_sql(sql_text: str) -> list[str]:
    """Split plain SQL into statements, respecting `$$ … $$` blocks and '…' literals.

    Needed because `migrations/rls.sql` contains PL/pgSQL function bodies whose inner
    semicolons must not split the statement. Naively splitting on ";" (or, as this used
    to, on the file's `-- >>>` markers) cut `DO $$ … $$;` in half and PostgreSQL rejected
    every fragment — so `init_db()` always failed on PostgreSQL and the API never started.
    """
    statements: list[str] = []
    buf: list[str] = []
    i, n = 0, len(sql_text)
    in_string = False
    dollar: str | None = None
    while i < n:
        ch = sql_text[i]
        if dollar:
            if sql_text.startswith(dollar, i):
                buf.append(dollar)
                i += len(dollar)
                dollar = None
                continue
            buf.append(ch)
            i += 1
            continue
        if in_string:
            buf.append(ch)
            if ch == "'":
                if i + 1 < n and sql_text[i + 1] == "'":  # escaped ''
                    buf.append("'")
                    i += 2
                    continue
                in_string = False
            i += 1
            continue
        if ch == "'":
            in_string = True
            buf.append(ch)
            i += 1
            continue
        if ch == "$":
            match = re.match(r"\$[A-Za-z_]*\$", sql_text[i:])
            if match:
                dollar = match.group(0)
                buf.append(dollar)
                i += len(dollar)
                continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


def rls_statements(sql_text: str) -> list[str]:
    """Read `migrations/rls.sql` into executable statements.

    Every SQL line in that file is prefixed with the marker below (`-- >>> SELECT 1;`) so
    the file stays readable as prose while remaining runnable. Non-marked lines are prose
    and are dropped; the marked lines are then split on real statement boundaries (see
    `_split_sql`), which keeps `DO $$ … $$;` and function bodies in one piece.
    """
    marked: list[str] = []
    for line in sql_text.splitlines():
        match = _RLS_MARKER.match(line)
        if match:
            marked.append(line[match.end():])
    return _split_sql("\n".join(marked))


_INITIALISED = False


def init_db(force: bool = False) -> None:
    """Create tables, add new columns, install the vector mirror and RLS policies.

    Idempotent and cheap after the first call: every entry point calls it (the API's
    lifespan, the seed script, the serverless function wrapper), and running the RLS file
    twice per boot only produced duplicate-policy warnings.
    """
    global _INITIALISED
    if _INITIALISED and not force:
        return
    from . import models  # noqa: F401  (register tables)

    Base.metadata.create_all(engine)
    _add_missing_columns()
    _INITIALISED = True
    if not settings.is_postgres:
        return

    log = logging.getLogger("sentinel.db")
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    # The vector mirror column is created at the *provider's* embedding dimension, before
    # the RLS file's indexes touch it. (It used to be hard-coded to 1536 while the offline
    # engine emits 256-dimension vectors, so every insert failed on PostgreSQL.)
    from .services.retrieval import ensure_vector_table
    with SessionLocal() as db:
        ensure_vector_table(db)
        db.commit()

    rls_path = __import__("pathlib").Path(__file__).resolve().parent.parent / "migrations" / "rls.sql"
    if not rls_path.exists():
        return
    statements = rls_statements(rls_path.read_text())
    applied, skipped = 0, []
    for stmt in statements:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
            applied += 1
        except Exception as exc:  # noqa: BLE001 - classified below
            name = type(exc).__name__
            # A managed database role may be allowed to run the app but not to create
            # roles or policies. That is a deployment configuration issue, not a bug in
            # the SQL: record it and keep serving (every query is still org-scoped).
            if "InsufficientPrivilege" in name or "permission denied" in str(exc).lower() \
                    or "already exists" in str(exc).lower():
                log.warning("RLS statement skipped (%s): %s", name, str(exc).splitlines()[0][:160])
                skipped.append(stmt.splitlines()[0][:120])
                continue
            RLS_STATUS.update(applied=False, skipped=skipped, error=f"{name}: {exc}")
            raise
    RLS_STATUS.update(applied=True, statements=applied, skipped=skipped, error=None)
    log.info("RLS ready: %s statements applied, %s skipped", applied, len(skipped))
