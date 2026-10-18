"""Signed-in user's own data. Every route here requires a session and only touches rows the
user owns; the older open routes stay for the shopping agent, the attack lab and tests."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.agents import _agent_out
from app.api.approvals import ApprovalRequest, post_approval
from app.api.mandates import MandateCreate, MandatePatch, _http
from app.api.orders import _order_to_dict
from app.api.vault import vault_setup
from app.auth import current_user
from app.crypto.keys import load_public_key
from app.db import get_db
from app.ids import new_id
from app.intents import create_intent, intent_to_dict
from app.mandates import create_mandate, list_mandates_for_user, mandate_to_dict, revoke_mandate, update_mandate
from app.models import Agent, Intent, Mandate, Order, User
from app.service_errors import ServiceError

router = APIRouter(prefix="/me", tags=["me"])

BUCKETS: dict[str, tuple[str, ...]] = {
    "needs_approval": ("pending_approval",),
    "paid": ("captured",),
    "blocked": ("voided", "rejected", "failed"),
    "in_progress": ("received", "authorized", "checking"),
}


def _not_found(what: str) -> HTTPException:
    return HTTPException(404, detail={"error": "not_found", "reason": f"{what} not found"})


def _own_order(db: Session, user: User, order_id: str) -> Order:
    order = db.get(Order, order_id)
    if order is None or order.user_id != user.id:
        raise _not_found("order")
    return order


def _own_agent(db: Session, user: User, agent_id: str) -> Agent:
    agent = db.get(Agent, agent_id)
    if agent is None or agent.user_id != user.id:
        raise _not_found("agent")
    return agent


def _own_mandate(db: Session, user: User, mandate_id: str) -> Mandate:
    m = db.get(Mandate, mandate_id)
    if m is None or db.get(Agent, m.agent_id).user_id != user.id:
        raise _not_found("spending rule")
    return m


# --------------------------------------------------------------------------- #
# Overview
# --------------------------------------------------------------------------- #

@router.get("/summary")
def summary(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rows = db.execute(
        select(Order.status, func.count(), func.coalesce(func.sum(Order.total), 0))
        .where(Order.user_id == user.id, Order.created_at >= month_start)
        .group_by(Order.status)
    ).all()
    by_status = {s: (n, Decimal(t)) for s, n, t in rows}
    count = lambda bucket: sum(by_status.get(s, (0, 0))[0] for s in BUCKETS[bucket])  # noqa: E731
    spent = sum((by_status.get(s, (0, Decimal(0)))[1] for s in BUCKETS["paid"]), Decimal(0))

    waiting_total = db.execute(
        select(func.count()).where(Order.user_id == user.id, Order.status == "pending_approval")
    ).scalar_one()
    agents = db.execute(select(Agent).where(Agent.user_id == user.id)).scalars().all()
    rules = list_mandates_for_user(db, user.id)
    recent = db.execute(
        select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc()).limit(6)
    ).scalars().all()
    requests = db.execute(select(func.count()).where(Intent.user_id == user.id)).scalar_one()

    return {
        "currency": user.currency or "USD",
        "month": {
            "orders": sum(n for n, _ in by_status.values()),
            "paid": count("paid"),
            "blocked": count("blocked"),
            "spent": str(spent.quantize(Decimal("0.01"))),
        },
        "needs_approval": waiting_total,
        "agents_active": sum(1 for a in agents if a.revoked_at is None),
        "rules_active": sum(1 for m in rules if m.revoked_at is None),
        "requests": requests,
        "payment_connected": bool(user.paypal_payment_token),
        "recent_orders": [_order_to_dict(o) for o in recent],
    }


# --------------------------------------------------------------------------- #
# Orders
# --------------------------------------------------------------------------- #

@router.get("/orders")
def orders(
    view: Literal["all", "needs_approval", "paid", "blocked", "in_progress"] = Query(default="all"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    stmt = select(Order).where(Order.user_id == user.id)
    if view != "all":
        stmt = stmt.where(Order.status.in_(BUCKETS[view]))
    stmt = stmt.order_by(Order.created_at.desc()).limit(500)
    return [_order_to_dict(o) for o in db.execute(stmt).scalars().all()]


@router.get("/orders/{order_id}")
def order(order_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return _order_to_dict(_own_order(db, user, order_id), include_checks=True)


@router.post("/orders/{order_id}/approval")
def approve(order_id: str, body: ApprovalRequest, user: User = Depends(current_user),
            db: Session = Depends(get_db)):
    _own_order(db, user, order_id)
    return post_approval(order_id, body, db)


# --------------------------------------------------------------------------- #
# Agents
# --------------------------------------------------------------------------- #

class AgentConnect(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    public_key: str = Field(min_length=1, max_length=64)
    device_id: str = Field(default="", max_length=128)


@router.get("/agents")
def agents(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.execute(
        select(Agent).where(Agent.user_id == user.id).order_by(Agent.created_at.desc())
    ).scalars().all()
    return [_agent_out(a) for a in rows]


@router.post("/agents", status_code=201)
def connect_agent(body: AgentConnect, user: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        load_public_key(body.public_key)
    except ValueError:
        raise HTTPException(422, detail={"error": "invalid_public_key",
                                         "reason": "That isn't a valid Ed25519 public key (base64url, 32 bytes)."})
    agent = Agent(id=new_id("agt"), user_id=user.id, name=body.name, public_key=body.public_key,
                  device_id=body.device_id or "unspecified", verified=False)
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return _agent_out(agent)


@router.post("/agents/{agent_id}/revoke")
def revoke_agent(agent_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    agent = _own_agent(db, user, agent_id)
    if agent.revoked_at is None:
        agent.revoked_at = datetime.now(timezone.utc)
        db.commit()
    db.refresh(agent)
    return _agent_out(agent)


# --------------------------------------------------------------------------- #
# Spending rules (mandates)
# --------------------------------------------------------------------------- #

@router.get("/mandates")
def mandates(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    return [mandate_to_dict(m) for m in list_mandates_for_user(db, user.id)]


@router.post("/mandates", status_code=201)
def add_mandate(body: MandateCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _own_agent(db, user, body.agent_id)
    try:
        return mandate_to_dict(create_mandate(db, body.model_dump()))
    except ServiceError as e:
        raise _http(e)


@router.patch("/mandates/{mandate_id}")
def edit_mandate(mandate_id: str, body: MandatePatch, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    _own_mandate(db, user, mandate_id)
    patch = body.model_dump(exclude_unset=True)
    if patch.get("agent_id"):
        _own_agent(db, user, patch["agent_id"])
    try:
        return mandate_to_dict(update_mandate(db, mandate_id, patch))
    except ServiceError as e:
        raise _http(e)


@router.post("/mandates/{mandate_id}/revoke")
def end_mandate(mandate_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _own_mandate(db, user, mandate_id)
    try:
        return mandate_to_dict(revoke_mandate(db, mandate_id))
    except ServiceError as e:
        raise _http(e)


# --------------------------------------------------------------------------- #
# Purchase requests (intents)
# --------------------------------------------------------------------------- #

class RequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    agent_id: str = Field(min_length=1, max_length=64)
    request_text: str = Field(min_length=3, max_length=2000)


@router.get("/requests")
def intents(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.execute(
        select(Intent).where(Intent.user_id == user.id).order_by(Intent.signed_at.desc()).limit(200)
    ).scalars().all()
    order_counts = dict(db.execute(
        select(Order.intent_id, func.count()).where(Order.user_id == user.id).group_by(Order.intent_id)
    ).all())
    names = {a.id: a.name for a in db.execute(select(Agent).where(Agent.user_id == user.id)).scalars()}
    return [{**intent_to_dict(i), "agent_name": names.get(i.agent_id), "orders": order_counts.get(i.id, 0)}
            for i in rows]


@router.post("/requests", status_code=201)
def add_intent(body: RequestCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    agent = _own_agent(db, user, body.agent_id)
    if agent.revoked_at is not None:
        raise HTTPException(409, detail={"error": "agent_revoked", "reason": "This agent is disconnected."})
    try:
        i = create_intent(db, user_id=user.id, agent_id=agent.id, request_text=body.request_text)
    except ServiceError as e:
        raise HTTPException(e.status_code, detail={"error": e.error, "reason": e.reason})
    return {**intent_to_dict(i), "agent_name": agent.name, "orders": 0}


# --------------------------------------------------------------------------- #
# Payment method
# --------------------------------------------------------------------------- #

@router.get("/payment")
def payment(user: User = Depends(current_user)) -> dict[str, Optional[bool]]:
    return {"connected": bool(user.paypal_payment_token)}


@router.post("/payment/setup")
def payment_setup(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return vault_setup(user.id, db)
