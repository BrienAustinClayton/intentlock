"""IntentLock-hosted shopping agents.

The API creates the agent's Ed25519 key pair and keeps the private key sealed (AES-256-GCM, key derived
from AUTH_SECRET with HKDF). A run hands the key to the hosted agent service (apps/agent) over an
authenticated call; the service signs as that agent and reports back what happened.
"""
from __future__ import annotations

import base64
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import settings
from app.crypto.keys import generate_keypair_b64
from app.db import new_session
from app.ids import new_id
from app.models import Agent, AgentRun, Order

log = logging.getLogger("intentlock.hosted_agents")

RUN_TIMEOUT_S = 300
STALE_AFTER = timedelta(minutes=10)


class HostedAgentError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _cfg(name: str) -> str | None:
    v = getattr(settings, name, None)
    return None if v in (None, "", "__FILL_ME__") else v


def _aead() -> AESGCM:
    secret = _cfg("AUTH_SECRET")
    if not secret:
        raise HostedAgentError(503, "not_configured", "Hosted agents are not configured (AUTH_SECRET).")
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
               info=b"intentlock/hosted-agent-key/v1").derive(secret.encode())
    return AESGCM(key)


def seal(private_key_b64: str, agent_id: str) -> str:
    nonce = os.urandom(12)
    ct = _aead().encrypt(nonce, private_key_b64.encode(), agent_id.encode())
    return "v1." + base64.urlsafe_b64encode(nonce + ct).decode()


def unseal(sealed: str, agent_id: str) -> str:
    if not sealed.startswith("v1."):
        raise HostedAgentError(500, "bad_key", "Agent key is unreadable.")
    raw = base64.urlsafe_b64decode(sealed[3:])
    return _aead().decrypt(raw[:12], raw[12:], agent_id.encode()).decode()


def new_hosted_agent(user_id: str, name: str) -> Agent:
    agent_id = new_id("agt")
    private_b64, public_b64 = generate_keypair_b64()
    return Agent(id=agent_id, user_id=user_id, name=name, public_key=public_b64,
                 device_id="intentlock-hosted", verified=True, managed=True,
                 secret_enc=seal(private_b64, agent_id))


def run_to_dict(run: AgentRun | None, order: Order | None = None) -> dict[str, Any] | None:
    if run is None:
        return None
    status, summary = run.status, run.summary
    started = run.started_at if run.started_at.tzinfo else run.started_at.replace(tzinfo=timezone.utc)
    if status == "running" and datetime.now(timezone.utc) - started > STALE_AFTER:
        status, summary = "failed", "The shopping agent didn't finish in time. Try again."
    return {
        "id": run.id,
        "status": status,
        "summary": summary,
        "errors": list(run.errors or []),
        "order_id": run.order_id,
        "order_status": order.status if order is not None else None,
        "started_at": started.isoformat().replace("+00:00", "Z"),
        "finished_at": run.finished_at.isoformat().replace("+00:00", "Z") if run.finished_at else None,
    }


def _finish(db, run: AgentRun, status: str, summary: str, errors: list[str] | None = None,
            order_id: str | None = None) -> None:
    run.status = status
    run.summary = summary[:4000]
    run.errors = [str(e)[:500] for e in (errors or [])][:10]
    run.order_id = order_id
    run.finished_at = datetime.now(timezone.utc)
    db.commit()


def execute_run(run_id: str, db=None) -> None:
    """Background task: ask the hosted agent service to shop for one purchase request."""
    own = db is None
    db = db or new_session()
    try:
        run = db.get(AgentRun, run_id)
        if run is None or run.status != "running":
            return
        agent = db.get(Agent, run.agent_id)
        url, secret = _cfg("AGENT_SERVICE_URL"), _cfg("AGENT_RUN_SECRET")
        if not url or not secret:
            return _finish(db, run, "failed", "The hosted shopping agent isn't configured yet.")
        if agent is None or not agent.managed or not agent.secret_enc or agent.revoked_at is not None:
            return _finish(db, run, "failed", "This agent can't be run by IntentLock.")
        try:
            key = unseal(agent.secret_enc, agent.id)
        except Exception:
            log.exception("hosted_agents.unseal_failed agent=%s", agent.id)
            return _finish(db, run, "failed", "The agent's key couldn't be read. Create a new hosted agent.")
        try:
            r = httpx.post(f"{url.rstrip('/')}/run", timeout=RUN_TIMEOUT_S,
                           headers={"Authorization": f"Bearer {secret}"},
                           json={"intent_id": run.intent_id, "agent_id": agent.id, "agent_private_key": key})
        except httpx.HTTPError as e:
            log.warning("hosted_agents.unreachable run=%s err=%s", run.id, type(e).__name__)
            return _finish(db, run, "failed", "Couldn't reach the shopping agent. Try again in a minute.")
        try:
            data = r.json()
        except ValueError:
            data = {}
        if r.status_code != 200:
            reason = data.get("reason") if isinstance(data, dict) else None
            return _finish(db, run, "failed", f"The shopping agent stopped: {reason or f'HTTP {r.status_code}'}.")
        summary = str(data.get("summary") or "").strip()
        errors = data.get("errors") if isinstance(data.get("errors"), list) else []
        order_id = data.get("order_id") if isinstance(data.get("order_id"), str) else None
        if order_id:
            return _finish(db, run, "ordered", summary or "Order placed.", errors, order_id)
        return _finish(db, run, "failed", summary or "The agent finished without placing an order.", errors)
    finally:
        if own:
            db.close()


def start_run(db, intent_id: str, user_id: str, agent_id: str) -> AgentRun:
    run = AgentRun(id=new_id("run"), intent_id=intent_id, user_id=user_id, agent_id=agent_id,
                   status="running", started_at=datetime.now(timezone.utc))
    db.add(run)
    db.commit()
    return run
