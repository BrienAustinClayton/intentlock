"""Tests for P1-T12: GET /orders and GET /orders/{id}."""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.ids import new_id  # noqa: E402
from app.models import Agent, Approval, Check, Intent, Mandate, Order, User  # noqa: E402

# conftest.py provides: engine, db, client, wallet_key_b64


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(db: Session) -> User:
    u = User(id=new_id("usr"), name="Test User")
    db.add(u)
    db.flush()
    return u


def _make_agent(db: Session, user: User) -> Agent:
    a = Agent(
        id=new_id("agt"),
        user_id=user.id,
        name="Test Agent",
        public_key="dummykey",
        device_id="dev-1",
        verified=False,
    )
    db.add(a)
    db.flush()
    return a


def _make_intent(db: Session, user: User, agent: Agent) -> Intent:
    i = Intent(
        id=new_id("int"),
        user_id=user.id,
        agent_id=agent.id,
        request_text="buy milk",
        signed_at=datetime.now(timezone.utc),
        signature="dummy",
    )
    db.add(i)
    db.flush()
    return i


def _make_order(
    db: Session,
    user: User,
    agent: Agent,
    intent: Intent,
    *,
    status: str = "captured",
    decision: str | None = "capture",
) -> Order:
    o = Order(
        id=new_id("ord"),
        intent_id=intent.id,
        agent_id=agent.id,
        user_id=user.id,
        merchant="freshmart",
        cart_json=[{"product_id": "p1", "qty": 1}],
        total=Decimal("10.00"),
        currency="USD",
        status=status,
        decision=decision,
        reasons=[],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(o)
    db.flush()
    return o


def _make_check(db: Session, order: Order, *, step: str = "decide") -> Check:
    c = Check(
        id=new_id("chk"),
        order_id=order.id,
        step=step,
        result="pass",
        score=None,
        details_json=None,
        duration_ms=5,
        created_at=datetime.now(timezone.utc),
    )
    db.add(c)
    db.flush()
    return c


# ---------------------------------------------------------------------------
# Tests — GET /orders
# ---------------------------------------------------------------------------

def test_list_orders_empty(client):
    resp = client.get("/orders")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_orders_returns_all(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    intent = _make_intent(db, user, agent)
    _make_order(db, user, agent, intent)
    _make_order(db, user, agent, intent)
    db.commit()

    resp = client.get("/orders")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_orders_filter_by_user_id(client, db):
    user1 = _make_user(db)
    user2 = _make_user(db)
    agent1 = _make_agent(db, user1)
    agent2 = _make_agent(db, user2)
    intent1 = _make_intent(db, user1, agent1)
    intent2 = _make_intent(db, user2, agent2)
    _make_order(db, user1, agent1, intent1)
    _make_order(db, user2, agent2, intent2)
    db.commit()

    resp = client.get(f"/orders?user_id={user1.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["user_id"] == user1.id


def test_list_orders_filter_by_status(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    intent = _make_intent(db, user, agent)
    _make_order(db, user, agent, intent, status="captured", decision="capture")
    _make_order(db, user, agent, intent, status="voided", decision="void")
    db.commit()

    resp = client.get("/orders?status=captured")
    assert resp.status_code == 200
    data = resp.json()
    assert all(o["status"] == "captured" for o in data)


def test_list_orders_shape(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    intent = _make_intent(db, user, agent)
    _make_order(db, user, agent, intent)
    db.commit()

    resp = client.get("/orders")
    assert resp.status_code == 200
    o = resp.json()[0]
    for field in ("id", "user_id", "agent_id", "merchant", "total", "currency", "status", "decision", "reasons", "created_at"):
        assert field in o, f"missing field {field!r}"
    # checks/approval not included in list
    assert "checks" not in o
    assert "approval" not in o


# ---------------------------------------------------------------------------
# Tests — GET /orders/{id}
# ---------------------------------------------------------------------------

def test_get_order_not_found(client):
    resp = client.get("/orders/ord_nonexistent")
    assert resp.status_code == 404
    body = resp.json()
    # error handler flattens dict details to top level
    assert body.get("error") == "not_found" or body.get("detail", {}).get("error") == "not_found"


def test_get_order_basic(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    intent = _make_intent(db, user, agent)
    order = _make_order(db, user, agent, intent)
    db.commit()

    resp = client.get(f"/orders/{order.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == order.id
    assert data["merchant"] == "freshmart"
    assert data["total"] == "10.00"
    assert "checks" in data
    assert "approval" in data


def test_get_order_checks_ordered_by_created_at(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    intent = _make_intent(db, user, agent)
    order = _make_order(db, user, agent, intent)

    now = datetime.now(timezone.utc)
    c1 = Check(
        id=new_id("chk"), order_id=order.id, step="verify_agent", result="pass",
        created_at=now - timedelta(seconds=2), duration_ms=1,
    )
    c2 = Check(
        id=new_id("chk"), order_id=order.id, step="check_mandate", result="pass",
        created_at=now - timedelta(seconds=1), duration_ms=1,
    )
    c3 = Check(
        id=new_id("chk"), order_id=order.id, step="decide", result="pass",
        created_at=now, duration_ms=1,
    )
    # Insert in reverse order to verify server sorts them
    db.add(c3)
    db.add(c1)
    db.add(c2)
    db.commit()

    resp = client.get(f"/orders/{order.id}")
    assert resp.status_code == 200
    checks = resp.json()["checks"]
    assert len(checks) == 3
    steps = [c["step"] for c in checks]
    assert steps == ["verify_agent", "check_mandate", "decide"]


def test_get_order_approval_none_when_absent(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    intent = _make_intent(db, user, agent)
    order = _make_order(db, user, agent, intent)
    db.commit()

    resp = client.get(f"/orders/{order.id}")
    assert resp.status_code == 200
    assert resp.json()["approval"] is None


def test_get_order_approval_present(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    intent = _make_intent(db, user, agent)
    order = _make_order(db, user, agent, intent, status="pending_approval", decision="hold")
    apr = Approval(
        id=new_id("apr"),
        order_id=order.id,
        requested_at=datetime.now(timezone.utc),
    )
    db.add(apr)
    db.commit()

    resp = client.get(f"/orders/{order.id}")
    assert resp.status_code == 200
    approval = resp.json()["approval"]
    assert approval is not None
    assert approval["order_id"] == order.id
    assert approval["decision"] is None


def test_get_order_reasons_stored_as_is(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    intent = _make_intent(db, user, agent)
    reasons = ["Merchant not allowed", "Over budget"]
    order = _make_order(db, user, agent, intent, status="rejected", decision="reject")
    order.reasons = reasons
    db.flush()
    db.commit()

    resp = client.get(f"/orders/{order.id}")
    assert resp.status_code == 200
    assert resp.json()["reasons"] == reasons
