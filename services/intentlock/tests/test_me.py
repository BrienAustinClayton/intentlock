"""/me routes: signed-in user's own data only."""
from __future__ import annotations

import base64
from decimal import Decimal

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app import auth
from app.ids import new_id
from app.models import Order, User


def _pub() -> str:
    raw = Ed25519PrivateKey.generate().public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _user(db, name):
    u = User(id=new_id("usr"), name=name, email=f"{name.lower()}@example.com", currency="USD")
    db.add(u)
    db.flush()
    tok = auth._login(db, u, "pytest", True)["token"]
    return u, {"Authorization": f"Bearer {tok}"}


@pytest.fixture()
def two(db):
    return _user(db, "Alice"), _user(db, "Bob")


def _agent(client, h, name="Shopper"):
    r = client.post("/me/agents", headers=h, json={"name": name, "public_key": _pub()})
    assert r.status_code == 201, r.text
    return r.json()


def _order(db, user, intent_id, agent_id, status, total="10.00"):
    o = Order(id=new_id("ord"), intent_id=intent_id, agent_id=agent_id, user_id=user.id,
              merchant="freshmart", cart_json=[], total=Decimal(total), currency="USD", status=status)
    db.add(o)
    db.flush()
    return o


def test_requires_session(client):
    for path in ("/me/summary", "/me/orders", "/me/agents", "/me/mandates", "/me/requests", "/me/payment"):
        assert client.get(path).status_code == 401


def test_empty_summary_for_new_user(client, two):
    (_, h), _ = two
    s = client.get("/me/summary", headers=h).json()
    assert s["month"] == {"orders": 0, "paid": 0, "blocked": 0, "spent": "0.00"}
    assert s["needs_approval"] == 0 and s["agents_active"] == 0 and s["recent_orders"] == []
    assert s["payment_connected"] is False


def test_agents_requests_orders_are_isolated(client, db, two):
    (alice, ha), (bob, hb) = two
    agent = _agent(client, ha)
    assert client.get("/me/agents", headers=hb).json() == []

    r = client.post("/me/requests", headers=ha, json={"agent_id": agent["id"], "request_text": "2 litres of milk"})
    assert r.status_code == 201, r.text
    intent = r.json()
    assert client.post("/me/requests", headers=hb, json={"agent_id": agent["id"], "request_text": "x" * 5}).status_code == 404
    assert [i["id"] for i in client.get("/me/requests", headers=ha).json()] == [intent["id"]]
    assert client.get("/me/requests", headers=hb).json() == []

    paid = _order(db, alice, intent["id"], agent["id"], "captured", "12.50")
    _order(db, alice, intent["id"], agent["id"], "voided")
    held = _order(db, alice, intent["id"], agent["id"], "pending_approval")

    s = client.get("/me/summary", headers=ha).json()
    assert s["month"] == {"orders": 3, "paid": 1, "blocked": 1, "spent": "12.50"}
    assert s["needs_approval"] == 1 and s["agents_active"] == 1 and s["requests"] == 1
    assert [o["id"] for o in client.get("/me/orders?view=needs_approval", headers=ha).json()] == [held.id]
    assert [o["id"] for o in client.get("/me/orders?view=paid", headers=ha).json()] == [paid.id]

    assert client.get("/me/orders", headers=hb).json() == []
    assert client.get(f"/me/orders/{paid.id}", headers=hb).status_code == 404
    assert client.get(f"/me/orders/{paid.id}", headers=ha).json()["id"] == paid.id
    assert client.post(f"/me/orders/{held.id}/approval", headers=hb, json={"decision": "approve"}).status_code == 404
    assert client.post(f"/me/agents/{agent['id']}/revoke", headers=hb).status_code == 404


def test_rules_only_on_own_agents(client, two):
    (_, ha), (_, hb) = two
    agent = _agent(client, ha)
    body = {"agent_id": agent["id"], "categories": ["groceries"], "merchants": ["freshmart"],
            "budget_amount": "100.00", "budget_period": "month", "currency": "USD"}
    assert client.post("/me/mandates", headers=hb, json=body).status_code == 404
    r = client.post("/me/mandates", headers=ha, json=body)
    assert r.status_code == 201, r.text
    mid = r.json()["id"]
    assert client.get("/me/mandates", headers=hb).json() == []
    assert client.patch(f"/me/mandates/{mid}", headers=hb, json={"budget_amount": "5.00"}).status_code == 404
    assert client.post(f"/me/mandates/{mid}/revoke", headers=hb).status_code == 404
    assert client.post(f"/me/mandates/{mid}/revoke", headers=ha).json()["revoked_at"]
    assert client.get("/me/summary", headers=ha).json()["rules_active"] == 0


def test_revoked_agent_cannot_take_requests(client, two):
    (_, ha), _ = two
    agent = _agent(client, ha)
    client.post(f"/me/agents/{agent['id']}/revoke", headers=ha)
    r = client.post("/me/requests", headers=ha, json={"agent_id": agent["id"], "request_text": "eggs please"})
    assert r.status_code == 409


def test_bad_public_key(client, two):
    (_, ha), _ = two
    r = client.post("/me/agents", headers=ha, json={"name": "x", "public_key": "not-a-key"})
    assert r.status_code == 422 and r.json()["error"] == "invalid_public_key"


# --------------------------------------------------------------------------- #
# Hosted agents and runs
# --------------------------------------------------------------------------- #

from app import hosted_agents  # noqa: E402
from app.config import settings  # noqa: E402
from app.models import Agent, AgentRun  # noqa: E402


class _Resp:
    def __init__(self, status, body):
        import json
        self.status_code, self._b, self.text = status, body, json.dumps(body)

    def json(self):
        return self._b


@pytest.fixture()
def hosted(monkeypatch, db):
    monkeypatch.setattr(settings, "AUTH_SECRET", "test-secret")
    monkeypatch.setattr(settings, "AGENT_SERVICE_URL", "http://agent.test")
    monkeypatch.setattr(settings, "AGENT_RUN_SECRET", "run-secret")
    calls, reply = [], {"value": _Resp(200, {"order_id": None, "summary": "No chocolate in the catalog.", "errors": []})}

    def fake_post(url, **kw):
        calls.append((url, kw))
        r = reply["value"]
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(hosted_agents.httpx, "post", fake_post)
    real = hosted_agents.execute_run
    monkeypatch.setattr(hosted_agents, "execute_run", lambda rid: real(rid, db=db))
    return calls, reply


def _hosted_agent(client, h):
    r = client.post("/me/agents/hosted", headers=h, json={"name": "Shopper"})
    assert r.status_code == 201, r.text
    return r.json()


def test_hosted_agent_key_is_sealed_and_never_returned(client, db, two, hosted):
    (_, ha), _ = two
    a = _hosted_agent(client, ha)
    assert a["managed"] is True and "secret_enc" not in a
    row = db.get(Agent, a["id"])
    assert row.secret_enc.startswith("v1.")
    key = hosted_agents.unseal(row.secret_enc, row.id)
    from app.crypto.keys import load_private_key, public_key_b64
    assert public_key_b64(load_private_key(key)) == row.public_key
    with pytest.raises(Exception):
        hosted_agents.unseal(row.secret_enc, "agt_other")
    assert all("secret" not in k for x in client.get("/me/agents", headers=ha).json() for k in x)


def test_request_runs_hosted_agent_and_records_failure(client, two, hosted):
    calls, _ = hosted
    (_, ha), _ = two
    a = _hosted_agent(client, ha)
    r = client.post("/me/requests", headers=ha, json={"agent_id": a["id"], "request_text": "Chocolates worth $2"})
    assert r.status_code == 201, r.text
    assert r.json()["run"]["status"] == "running"
    url, kw = calls[0]
    assert url == "http://agent.test/run" and kw["headers"]["Authorization"] == "Bearer run-secret"
    assert kw["json"]["agent_id"] == a["id"] and kw["json"]["agent_private_key"]
    run = client.get("/me/requests", headers=ha).json()[0]["run"]
    assert run["status"] == "failed" and run["summary"] == "No chocolate in the catalog."


def test_run_that_orders_and_rerun_rules(client, db, two, hosted):
    calls, reply = hosted
    (alice, ha), (_, hb) = two
    a = _hosted_agent(client, ha)
    reply["value"] = hosted_agents.httpx.ConnectError("down")
    req = client.post("/me/requests", headers=ha, json={"agent_id": a["id"], "request_text": "USB-C cable"}).json()
    run = client.get("/me/requests", headers=ha).json()[0]["run"]
    assert run["status"] == "failed" and "reach" in run["summary"]

    o = _order(db, alice, req["id"], a["id"], "captured")
    reply["value"] = _Resp(200, {"order_id": o.id, "summary": "Bought it.", "errors": []})
    assert client.post(f"/me/requests/{req['id']}/run", headers=hb).status_code == 404
    assert client.post(f"/me/requests/{req['id']}/run", headers=ha).status_code == 202
    run = client.get("/me/requests", headers=ha).json()[0]["run"]
    assert run["status"] == "ordered" and run["order_id"] == o.id and run["order_status"] == "captured"
    assert client.post(f"/me/requests/{req['id']}/run", headers=ha).json()["error"] == "already_ordered"
    assert db.query(AgentRun).count() == 2


def test_own_agent_requests_are_not_run(client, two, hosted):
    calls, _ = hosted
    (_, ha), _ = two
    a = _agent(client, ha)
    req = client.post("/me/requests", headers=ha, json={"agent_id": a["id"], "request_text": "milk"}).json()
    assert req["run"] is None and calls == []
    assert client.post(f"/me/requests/{req['id']}/run", headers=ha).json()["error"] == "not_hosted"


def test_agent_service_error_is_reported(client, two, hosted):
    _, reply = hosted
    (_, ha), _ = two
    a = _hosted_agent(client, ha)
    reply["value"] = _Resp(403, {"reason": "intent belongs to a different agent"})
    client.post("/me/requests", headers=ha, json={"agent_id": a["id"], "request_text": "milk please"})
    run = client.get("/me/requests", headers=ha).json()[0]["run"]
    assert run["status"] == "failed" and "different agent" in run["summary"]


def test_run_dispatch_is_recorded_for_developers_not_users(client, db, two, hosted):
    (_, ha), _ = two
    a = _hosted_agent(client, ha)
    client.post("/me/requests", headers=ha, json={"agent_id": a["id"], "request_text": "Chocolates worth $2"})
    row = db.query(AgentRun).one()
    assert row.endpoint == "http://agent.test/run" and row.dispatched_at and row.attempts == 1
    assert row.response_status == 200 and row.response_ms is not None and row.response_excerpt
    run = client.get("/me/requests", headers=ha).json()[0]["run"]
    assert not {"endpoint", "response_excerpt", "response_status", "dispatched_at"} & set(run)
    assert client.get("/me/runs", headers=ha).status_code == 404


def test_missing_config_names_the_variable(client, two, hosted, monkeypatch):
    (_, ha), _ = two
    a = _hosted_agent(client, ha)
    monkeypatch.setattr(settings, "AGENT_SERVICE_URL", None)
    client.post("/me/requests", headers=ha, json={"agent_id": a["id"], "request_text": "milk please"})
    run = client.get("/me/requests", headers=ha).json()[0]["run"]
    assert run["status"] == "failed" and "AGENT_SERVICE_URL" in run["summary"]


def test_watchdog_resends_unsent_and_fails_lost_runs(client, db, two, hosted):
    from datetime import datetime, timedelta, timezone
    calls, _ = hosted
    (alice, ha), _ = two
    a = _hosted_agent(client, ha)
    intent = client.post("/me/requests", headers=ha, json={"agent_id": a["id"], "request_text": "milk please"}).json()
    now = datetime.now(timezone.utc)
    unsent = hosted_agents.start_run(db, intent["id"], alice.id, a["id"])
    unsent.started_at = now - timedelta(minutes=1)
    lost = hosted_agents.start_run(db, intent["id"], alice.id, a["id"])
    lost.dispatched_at = now - timedelta(minutes=10)
    db.commit()
    resend, failed = hosted_agents.recover_runs(db, now)
    assert resend == [unsent.id] and failed == 1
    assert db.get(AgentRun, lost.id).status == "failed"
    n = len(calls)
    hosted_agents.execute_run(unsent.id)
    assert len(calls) == n + 1 and db.get(AgentRun, unsent.id).status == "failed"
    hosted_agents.execute_run(unsent.id)
    assert len(calls) == n + 1
