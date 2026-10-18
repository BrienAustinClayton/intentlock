"""Shared pytest fixtures for the intentlock service.

Advisory lock 912345 serialises DB creation + migration across parallel test
sessions.  Each test gets its own savepoint that is always rolled back.

Existing per-file fixtures (engine / db / client) override these because
pytest gives the closest-scope fixture precedence, so no existing test is
affected.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

ADVISORY_LOCK_KEY = 912345


def _test_db_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        return url
    try:
        from dotenv import dotenv_values
        base = (
            os.environ.get("DATABASE_URL")
            or dotenv_values(SERVICE_ROOT / ".env").get("DATABASE_URL")
        )
    except ImportError:
        base = os.environ.get("DATABASE_URL")
    if not base or base == "__FILL_ME__":
        pytest.fail("DATABASE_URL not configured; cannot locate intentlock_test")
    return make_url(base).set(database="intentlock_test").render_as_string(
        hide_password=False
    )


@pytest.fixture(scope="session")
def engine():
    """Session-scoped engine pointing at intentlock_test.

    Creates the DB if absent, runs alembic upgrade head under the advisory
    lock so parallel sessions don't race.
    """
    url = _test_db_url()
    u = make_url(url)
    admin = create_engine(u.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text("SELECT pg_advisory_lock(:k)"), {"k": ADVISORY_LOCK_KEY})
        try:
            if not c.execute(
                text("SELECT 1 FROM pg_database WHERE datname=:n"), {"n": u.database}
            ).scalar():
                c.execute(text(f'CREATE DATABASE "{u.database}"'))
            proc = subprocess.run(
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                cwd=SERVICE_ROOT,
                env={**os.environ, "DATABASE_URL": url},
                capture_output=True,
                text=True,
            )
            if proc.returncode != 0:
                pytest.fail(f"alembic upgrade failed: {proc.stderr[-2000:]}")
        finally:
            c.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": ADVISORY_LOCK_KEY})
    admin.dispose()
    eng = create_engine(url, pool_pre_ping=True)
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine):
    """Function-scoped session wrapped in a savepoint; always rolled back."""
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        conn.close()


@pytest.fixture()
def wallet_key_b64():
    """A fresh Ed25519 private key in base64url, no padding."""
    from app.signing import b64url_encode

    raw = Ed25519PrivateKey.generate().private_bytes(
        serialization.Encoding.Raw,
        serialization.PrivateFormat.Raw,
        serialization.NoEncryption(),
    )
    return b64url_encode(raw)


@pytest.fixture()
def client(db, wallet_key_b64, monkeypatch):
    """TestClient with the DB dependency overridden and wallet key set."""
    from app.config import settings
    from app.db import get_db
    from app.main import app as fastapi_app

    monkeypatch.setattr(settings, "INTENTLOCK_WALLET_PRIVATE_KEY", wallet_key_b64)

    def _override():
        yield db

    fastapi_app.dependency_overrides[get_db] = _override
    with TestClient(fastapi_app, raise_server_exceptions=True) as c:
        yield c
    fastapi_app.dependency_overrides.pop(get_db, None)
