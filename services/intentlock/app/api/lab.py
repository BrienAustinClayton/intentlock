"""Lab router: POST /lab/{scenario}.

Runs an Attack Lab scenario through the same verification and pipeline path as
POST /checkout: sign the request with the scenario agent's key, verify it with
verify_signed_message, create the order, then run the pipeline. Fixture page
paths (allow_fixtures=True) are accepted on this path only.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.checkout import CheckoutBody, build_order
from app.config import settings
from app.crypto.http_sig import (
    AgentVerificationError,
    sign_request,
    verify_signed_message,
)
from app.crypto.vector import VECTOR_PRIVATE_KEY
from app.db import get_db
from app.intents import create_intent, new_signed_intent
from app.models import Agent, User
from app.pipeline.runner import run_checkout
from app.pipeline.steps import record_check
from app.service_errors import ServiceError

router = APIRouter(tags=["lab"])

REPO_ROOT = Path(__file__).resolve().parents[4]
SCENARIOS_PATH = REPO_ROOT / "data" / "lab" / "scenarios.json"
AGENT_ENV_PATH = REPO_ROOT / "apps" / "agent" / ".env"
DEMO_AGENT_ID = "agt_demo_shopper"
DEFAULT_USER_ID = "usr_demo_priya"


@lru_cache(maxsize=1)
def _load_scenarios() -> dict[str, dict]:
    data = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    return {s["scenario"]: s for s in data}


def _err(status: int, error: str, reason: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": error, "reason": reason})


def _agent_private_key(agent_id: str) -> str:
    """Signing key for a scenario agent. Never logged or returned."""
    if agent_id != DEMO_AGENT_ID:
        return VECTOR_PRIVATE_KEY  # RFC 9421 B.1.4 published test key, lab agents only
    key = os.environ.get("AGENT_PRIVATE_KEY")
    if not key:
        try:
            from dotenv import dotenv_values
            key = dotenv_values(AGENT_ENV_PATH).get("AGENT_PRIVATE_KEY")
        except ImportError:
            key = None
    if not key or key == "__FILL_ME__":
        raise _err(503, "lab_unavailable", "AGENT_PRIVATE_KEY is not configured")
    return key


def _fixture_path(rel: str) -> str:
    return str((REPO_ROOT / rel).resolve())


def _target_uri(request: Request) -> str:
    base = settings.PUBLIC_BASE_URL
    base = base.rstrip("/") if base else f"{request.url.scheme}://{request.url.netloc}"
    return f"{base}/checkout"


_RESET_TABLES = ["approvals", "checks", "proofs", "schedule_events", "orders", "nonces"]


@router.post("/lab/reset")
async def reset_lab(db: Session = Depends(get_db)):
    """Delete all order-related rows so the lab can run from a clean state.

    Disabled (403) when env LAB_RESET_ENABLED == "0".
    """
    if os.environ.get("LAB_RESET_ENABLED", "1") == "0":
        raise HTTPException(
            status_code=403,
            detail={"error": "lab_reset_disabled", "reason": "reset is disabled"},
        )
    counts: dict[str, int] = {}
    for t in _RESET_TABLES:
        if t == "schedule_events":
            n = db.execute(
                text("select count(*) from schedule_events where type = 'order'")
            ).scalar() or 0
            db.execute(text("delete from schedule_events where type = 'order'"))
        else:
            n = db.execute(text(f"select count(*) from {t}")).scalar() or 0  # noqa: S608
            db.execute(text(f"delete from {t}"))  # noqa: S608
        counts[t] = n
    db.commit()
    return {"ok": True, "deleted": counts}


@router.post("/lab/{scenario}")
async def run_lab_scenario(
    scenario: str,
    request: Request,
    body: dict[str, Any] | None = Body(default=None),
    db: Session = Depends(get_db),
):
    sc = _load_scenarios().get(scenario)
    if sc is None:
        raise _err(404, "not_found", "unknown scenario")
    user_id = DEFAULT_USER_ID
    if isinstance(body, dict) and isinstance(body.get("user_id"), str) and body["user_id"]:
        user_id = body["user_id"]
    agent_id = sc["agent_id"]

    # Intent for the lab user (signed by the wallet key). A revoked agent cannot get one
    # through create_intent, so build and store it with the same signer.
    try:
        if db.get(User, user_id) is None:
            raise ServiceError(404, "not_found", "user not found")
        agent = db.get(Agent, agent_id)
        if agent is None:
            raise ServiceError(404, "not_found", "lab agent not found; run scripts/load_lab.py")
        if agent.user_id != user_id:
            raise ServiceError(403, "agent_user_mismatch", "agent does not belong to user")
        if agent.revoked_at is None:
            intent = create_intent(db, user_id=user_id, agent_id=agent_id,
                                   request_text=sc["request_text"])
        else:
            intent = new_signed_intent(user_id=user_id, agent_id=agent_id,
                                       request_text=sc["request_text"])
            db.add(intent)
            db.commit()
            db.refresh(intent)
    except ServiceError as e:
        raise _err(e.status_code, e.error, e.reason)

    checkout_body = {
        "intent_id": intent.id,
        "merchant": sc["merchant"],
        "cart": sc["cart"],
        "page_urls": [_fixture_path(p) for p in sc.get("page_urls", [])],
        "shipping_address": None,
        "trace_id": f"lab_{scenario}",
    }
    raw = json.dumps(checkout_body, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    target = _target_uri(request)
    headers = sign_request("POST", target, raw, _agent_private_key(agent_id), agent_id)

    # Same verification as /checkout
    verify_error: str | None = None
    try:
        verified = verify_signed_message(
            method="POST", target_uri=target, headers=request_headers_for(headers),
            body=raw, db=db,
        )
    except AgentVerificationError as e:
        verified, verify_error = None, e.reason

    parsed = CheckoutBody.model_validate_json(raw)
    order_agent = verified or db.get(Agent, agent_id)
    order = build_order(parsed, intent, order_agent)
    db.add(order)
    db.flush()
    if verified is not None:
        record_check(db, order.id, "verify_agent", "pass",
                     {"result": "pass", "reason": "ok", "keyid": agent_id}, 0)
    else:
        record_check(db, order.id, "verify_agent", "fail",
                     {"result": "fail", "reason": verify_error, "keyid": agent_id}, 0)
    db.commit()

    outcome = await run_checkout(db, order.id, allow_fixtures=True)
    return {
        "order_id": outcome.order_id,
        "scenario": scenario,
        "expected_decision": sc["expected_decision"],
        "actual_decision": outcome.decision,
        "status": outcome.status,
        "reasons": list(outcome.reasons),
    }


def request_headers_for(headers: dict[str, str]) -> dict[str, str]:
    return {k.lower(): v for k, v in headers.items()}
