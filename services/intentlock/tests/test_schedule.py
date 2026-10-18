"""Tests for P1-T12: Bryntum CrudManager schedule endpoints."""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.ids import new_id  # noqa: E402
from app.mandates import create_mandate  # noqa: E402
from app.models import Agent, Intent, Mandate, Order, ScheduleEvent, User  # noqa: E402

# conftest.py provides: engine, db, client, wallet_key_b64


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(db: Session) -> User:
    u = User(id=new_id("usr"), name="Sched User")
    db.add(u)
    db.flush()
    return u


def _make_agent(db: Session, user: User, *, name: str = "Sched Agent") -> Agent:
    a = Agent(
        id=new_id("agt"),
        user_id=user.id,
        name=name,
        public_key="pk_dummy",
        device_id="dev-s",
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
        request_text="plan purchase",
        signed_at=datetime.now(timezone.utc),
        signature="dummy",
    )
    db.add(i)
    db.flush()
    return i


def _make_order(db: Session, user: User, agent: Agent, intent: Intent) -> Order:
    o = Order(
        id=new_id("ord"),
        intent_id=intent.id,
        agent_id=agent.id,
        user_id=user.id,
        merchant="gadgethub",
        cart_json=[],
        total=Decimal("20.00"),
        currency="USD",
        status="captured",
        decision="capture",
        reasons=[],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(o)
    db.flush()
    return o


def _make_mandate(db: Session, agent: Agent) -> Mandate:
    return create_mandate(db, {
        "agent_id": agent.id,
        "categories": ["groceries"],
        "merchants": ["freshmart"],
        "budget_amount": "50.00",
        "budget_period": "week",
        "currency": "USD",
        "starts_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "expires_at": datetime(2026, 12, 31, tzinfo=timezone.utc),
    })


# ---------------------------------------------------------------------------
# Tests — GET /schedule/load
# ---------------------------------------------------------------------------

def test_schedule_load_empty(client):
    resp = client.get("/schedule/load")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "resources" in data
    assert "events" in data
    assert "assignments" in data
    assert data["resources"]["rows"] == []
    assert data["events"]["rows"] == []


def test_schedule_load_returns_bryntum_shape(client, db):
    user = _make_user(db)
    _make_agent(db, user)
    db.commit()

    resp = client.get(f"/schedule/load?user_id={user.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert isinstance(data["resources"]["rows"], list)
    assert isinstance(data["events"]["rows"], list)
    assert isinstance(data["assignments"]["rows"], list)


def test_schedule_load_includes_agents_as_resources(client, db):
    user = _make_user(db)
    a1 = _make_agent(db, user, name="Agent A")
    a2 = _make_agent(db, user, name="Agent B")
    db.commit()

    resp = client.get(f"/schedule/load?user_id={user.id}")
    data = resp.json()
    resource_ids = {r["id"] for r in data["resources"]["rows"]}
    assert a1.id in resource_ids
    assert a2.id in resource_ids


def test_schedule_load_includes_mandate_window_events(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    m = _make_mandate(db, agent)
    db.commit()

    resp = client.get(f"/schedule/load?user_id={user.id}")
    data = resp.json()
    events = data["events"]["rows"]
    mw = [e for e in events if e["type"] == "mandate_window"]
    assert len(mw) == 1
    e = mw[0]
    assert e["id"] == m.id
    assert e["resourceId"] == agent.id
    assert e["status"] == "confirmed"
    assert e["startDate"] is not None
    assert e["endDate"] is not None


def test_schedule_load_includes_order_events(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    intent = _make_intent(db, user, agent)
    order = _make_order(db, user, agent, intent)
    db.commit()

    resp = client.get(f"/schedule/load?user_id={user.id}")
    data = resp.json()
    events = data["events"]["rows"]
    oe = [e for e in events if e["type"] == "order"]
    assert len(oe) == 1
    e = oe[0]
    assert e["id"] == order.id
    assert e["status"] == "captured"
    assert e["order_id"] == order.id


def test_schedule_load_includes_planned_purchase_events(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    evt = ScheduleEvent(
        id=new_id("evt"),
        agent_id=agent.id,
        type="planned_purchase",
        title="Buy headphones",
        start=datetime(2026, 11, 1, tzinfo=timezone.utc),
        end=datetime(2026, 11, 2, tzinfo=timezone.utc),
        status="tentative",
    )
    db.add(evt)
    db.commit()

    resp = client.get(f"/schedule/load?user_id={user.id}")
    data = resp.json()
    events = data["events"]["rows"]
    pp = [e for e in events if e["type"] == "planned_purchase"]
    assert len(pp) == 1
    e = pp[0]
    assert e["name"] == "Buy headphones"
    assert e["status"] == "tentative"


def test_schedule_load_event_fields(client, db):
    """Every event row must have the Bryntum-required fields."""
    user = _make_user(db)
    agent = _make_agent(db, user)
    _make_mandate(db, agent)
    db.commit()

    resp = client.get(f"/schedule/load?user_id={user.id}")
    data = resp.json()
    for e in data["events"]["rows"]:
        for field in ("id", "resourceId", "name", "startDate", "type", "status"):
            assert field in e, f"event missing {field!r}: {e}"


def test_schedule_load_filter_by_user_id(client, db):
    user1 = _make_user(db)
    user2 = _make_user(db)
    a1 = _make_agent(db, user1)
    a2 = _make_agent(db, user2)
    db.commit()

    resp = client.get(f"/schedule/load?user_id={user1.id}")
    data = resp.json()
    resource_ids = {r["id"] for r in data["resources"]["rows"]}
    assert a1.id in resource_ids
    assert a2.id not in resource_ids


# ---------------------------------------------------------------------------
# Tests — POST /schedule/propose
# ---------------------------------------------------------------------------

def test_schedule_propose_creates_tentative_event(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    db.commit()

    resp = client.post("/schedule/propose", json={
        "agent_id": agent.id,
        "title": "Buy coffee maker",
        "start": "2026-11-10T09:00:00Z",
        "end": "2026-11-10T10:00:00Z",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "planned_purchase"
    assert data["status"] == "tentative"
    assert data["name"] == "Buy coffee maker"
    assert data["resourceId"] == agent.id
    assert data["id"].startswith("evt_")


def test_schedule_propose_unknown_agent_404(client):
    resp = client.post("/schedule/propose", json={
        "agent_id": "agt_nonexistent",
        "title": "Test",
        "start": "2026-11-10T09:00:00Z",
        "end": "2026-11-10T10:00:00Z",
    })
    assert resp.status_code == 404


def test_schedule_propose_event_visible_in_load(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    db.commit()

    client.post("/schedule/propose", json={
        "agent_id": agent.id,
        "title": "Buy speaker",
        "start": "2026-12-01T09:00:00Z",
        "end": "2026-12-01T10:00:00Z",
    })

    resp = client.get(f"/schedule/load?user_id={user.id}")
    events = resp.json()["events"]["rows"]
    pp = [e for e in events if e["type"] == "planned_purchase"]
    assert any(e["name"] == "Buy speaker" for e in pp)


# ---------------------------------------------------------------------------
# Tests — POST /schedule/sync
# ---------------------------------------------------------------------------

def test_schedule_sync_add_planned_purchase(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    db.commit()

    resp = client.post("/schedule/sync", json={
        "requestId": 42,
        "events": {
            "added": [{
                "$PhantomId": "phantom-1",
                "resourceId": agent.id,
                "name": "New purchase",
                "startDate": "2026-11-20T10:00:00Z",
                "endDate": "2026-11-20T11:00:00Z",
                "type": "planned_purchase",
                "status": "tentative",
            }]
        }
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["requestId"] == 42
    rows = data["events"]["rows"]
    assert len(rows) == 1
    assert rows[0]["$PhantomId"] == "phantom-1"
    assert rows[0]["id"].startswith("evt_")


def test_schedule_sync_add_phantom_mapping(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    db.commit()

    resp = client.post("/schedule/sync", json={
        "events": {
            "added": [
                {"$PhantomId": "p1", "resourceId": agent.id, "name": "A",
                 "startDate": "2026-11-01T09:00:00Z", "endDate": "2026-11-01T10:00:00Z",
                 "type": "planned_purchase", "status": "tentative"},
                {"$PhantomId": "p2", "resourceId": agent.id, "name": "B",
                 "startDate": "2026-11-02T09:00:00Z", "endDate": "2026-11-02T10:00:00Z",
                 "type": "planned_purchase", "status": "tentative"},
            ]
        }
    })
    data = resp.json()
    phantom_map = {r["$PhantomId"]: r["id"] for r in data["events"]["rows"]}
    assert "p1" in phantom_map
    assert "p2" in phantom_map
    assert phantom_map["p1"] != phantom_map["p2"]


def test_schedule_sync_update_mandate_end_date_resigns(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    m = _make_mandate(db, agent)
    old_signature = m.signature
    db.commit()

    resp = client.post("/schedule/sync", json={
        "events": {
            "updated": [{"id": m.id, "endDate": "2027-06-30T00:00:00Z"}]
        }
    })
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    db.expire(m)
    db.refresh(m)
    assert m.expires_at is not None
    assert m.expires_at.year == 2027
    # signature must have changed because mandate was re-signed
    assert m.signature != old_signature


def test_schedule_sync_update_planned_purchase(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    evt = ScheduleEvent(
        id=new_id("evt"),
        agent_id=agent.id,
        type="planned_purchase",
        title="Old title",
        start=datetime(2026, 11, 1, tzinfo=timezone.utc),
        end=datetime(2026, 11, 2, tzinfo=timezone.utc),
        status="tentative",
    )
    db.add(evt)
    db.commit()

    resp = client.post("/schedule/sync", json={
        "events": {
            "updated": [{"id": evt.id, "name": "New title", "endDate": "2026-11-03T00:00:00Z"}]
        }
    })
    assert resp.status_code == 200
    db.expire(evt)
    db.refresh(evt)
    assert evt.title == "New title"
    assert evt.end.year == 2026
    assert evt.end.month == 11
    assert evt.end.day == 3


def test_schedule_sync_remove_planned_purchase(client, db):
    user = _make_user(db)
    agent = _make_agent(db, user)
    evt = ScheduleEvent(
        id=new_id("evt"),
        agent_id=agent.id,
        type="planned_purchase",
        title="To delete",
        start=datetime(2026, 11, 1, tzinfo=timezone.utc),
        end=datetime(2026, 11, 2, tzinfo=timezone.utc),
        status="tentative",
    )
    db.add(evt)
    db.commit()
    evt_id = evt.id

    resp = client.post("/schedule/sync", json={
        "events": {"removed": [{"id": evt_id}]}
    })
    assert resp.status_code == 200
    assert db.get(ScheduleEvent, evt_id) is None


def test_schedule_sync_empty_body_ok(client):
    resp = client.post("/schedule/sync", json={})
    assert resp.status_code == 200
    assert resp.json()["success"] is True
