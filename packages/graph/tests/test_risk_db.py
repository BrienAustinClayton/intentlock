"""graph_risk built from Postgres (rolled-back transactions) + GET /graph/risk/{order_id}."""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_ROOT = REPO_ROOT / "services" / "intentlock"
sys.path.insert(0, str(SERVICE_ROOT))

from intentlock_graph import build as build_mod, graph_risk  # noqa: E402

ADVISORY_LOCK_KEY = 912345
PUB = "Zm9vYmFyLXRlc3Qta2V5LWZvci1ncmFwaC10ZXN0cy0x"  # unique, not a real key
PUB_OK = "Zm9vYmFyLXRlc3Qta2V5LWZvci1ncmFwaC10ZXN0cy0y"
NOW = datetime.now(timezone.utc)


def _test_db_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        return url
    from dotenv import dotenv_values

    base = os.environ.get("DATABASE_URL") or dotenv_values(SERVICE_ROOT / ".env").get("DATABASE_URL")
    if not base or base == "__FILL_ME__":
        pytest.skip("DATABASE_URL not configured")
    return make_url(base).set(database="intentlock_test").render_as_string(hide_password=False)


@pytest.fixture(scope="module")
def engine():
    url = _test_db_url()
    u = make_url(url)
    admin = create_engine(u.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        c = admin.connect()
    except Exception as exc:  # no database in this environment
        pytest.skip(f"postgres not reachable: {type(exc).__name__}")
    with c:
        c.execute(text("SELECT pg_advisory_lock(:k)"), {"k": ADVISORY_LOCK_KEY})
        try:
            if not c.execute(text("SELECT 1 FROM pg_database WHERE datname=:n"), {"n": u.database}).scalar():
                c.execute(text(f'CREATE DATABASE "{u.database}"'))
            py = SERVICE_ROOT / ".venv" / "bin" / "python"
            proc = subprocess.run(
                [str(py if py.exists() else sys.executable), "-m", "alembic", "upgrade", "head"],
                cwd=SERVICE_ROOT, env={**os.environ, "DATABASE_URL": url}, capture_output=True, text=True,
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
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        conn.close()


@pytest.fixture(autouse=True)
def _flags(tmp_path, monkeypatch):
    monkeypatch.setenv("INTENTLOCK_GRAPH_FLAGS_PATH", str(tmp_path / "flags.json"))
    monkeypatch.setattr(build_mod, "_MEM_FLAGS", {})


def _mk(db, n=0):
    from app.models import Agent, Intent, Order, User

    db.add(User(id="usr_demo_priya", name="Priya"))
    db.add(Agent(id="agt_demo_shopper", user_id="usr_demo_priya", name="Priya Shopper", public_key=PUB_OK,
                 device_id="dev_priya_macbook", verified=True))
    for i in range(1, 13):
        db.add(Agent(id=f"agt_lab_bot_{i:02d}", user_id="usr_demo_priya", name=f"Bot {i}", public_key=PUB,
                     device_id="dev_shared_bot_01" if i <= 6 else "dev_shared_bot_02", verified=False))
    db.flush()
    db.add(Intent(id="int_t", user_id="usr_demo_priya", agent_id="agt_demo_shopper", request_text="x", signature="s"))
    db.flush()
    return Order, Intent


def _order(db, Order, oid, agent, merchant, at=None, status="received"):
    o = Order(id=oid, intent_id="int_t", agent_id=agent, user_id="usr_demo_priya", merchant=merchant,
              cart_json=[], total=Decimal("10.00"), currency="USD", status=status, created_at=at or NOW)
    db.add(o)
    db.flush()
    return o


def test_priya_normal_order_from_db_is_low(db):
    Order, _ = _mk(db)
    o = _order(db, Order, "ord_priya_ok", "agt_demo_shopper", "freshmart")
    r = graph_risk(o, db=db)
    assert r["score"] < 30, r


def test_bot_farm_order_from_db_is_high(db):
    Order, _ = _mk(db)
    o = _order(db, Order, "ord_bot", "agt_lab_bot_07", "dealsdaily")
    r = graph_risk(o, db=db)
    assert r["score"] >= 60, r
    sig = {s["name"]: s for s in r["signals"]}
    assert {"bot_farm", "shared_key", "flagged_merchant"} <= set(sig)
    assert all(isinstance(n, str) and n for s in r["signals"] for n in s["evidence"])
    assert "agt_lab_bot_07" in sig["bot_farm"]["evidence"]


def test_out_of_mandate_from_failed_check_rows(db):
    from app.models import Check

    Order, _ = _mk(db)
    prev = _order(db, Order, "ord_prev", "agt_demo_shopper", "freshmart", NOW - timedelta(hours=2), status="rejected")
    db.add(Check(id="chk_prev", order_id=prev.id, step="check_mandate", result="fail"))
    db.flush()
    o = _order(db, Order, "ord_now", "agt_demo_shopper", "freshmart")
    r = graph_risk(o, db=db)
    sig = {s["name"]: s for s in r["signals"]}
    assert sig["out_of_mandate"]["evidence"] == ["agt_demo_shopper", "ord_prev"]
    assert 20 <= r["score"] < 30


def test_dict_with_order_id_is_enriched_from_db(db):
    Order, _ = _mk(db)
    _order(db, Order, "ord_bot2", "agt_lab_bot_07", "dealsdaily")
    assert graph_risk({"order_id": "ord_bot2"}, db=db)["score"] >= 60


def test_db_failure_returns_error_shape(db):
    class Broken:
        def get(self, *a, **k):
            raise RuntimeError("db down")

    assert graph_risk({"order_id": "x", "agent_id": "a", "merchant": "m"}, db=Broken()) == {
        "result": "error", "score": None, "signals": []}


def test_endpoint_returns_contract_shape(db):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.api.graph import router
    from app.db import get_db

    Order, _ = _mk(db)
    _order(db, Order, "ord_bot3", "agt_lab_bot_07", "dealsdaily")
    _order(db, Order, "ord_ok3", "agt_demo_shopper", "freshmart")
    app = FastAPI()
    app.include_router(router)

    def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        bot = c.get("/graph/risk/ord_bot3")
        assert bot.status_code == 200
        body = bot.json()
        assert body["score"] >= 60
        assert set(body["signals"][0]) == {"name", "weight", "evidence"}
        assert c.get("/graph/risk/ord_ok3").json()["score"] < 30
        assert c.get("/graph/risk/ord_missing").status_code == 404
        assert c.post("/graph/ask").status_code == 422  # body required; behaviour in test_ask.py
