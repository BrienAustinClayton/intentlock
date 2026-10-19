"""Shopping chat: conversations with a hosted agent that suggests products within its spending rules
and buys the one the user picks (as a signed purchase request checked by IntentLock)."""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import hosted_agents
from app.auth import current_user
from app.db import get_db
from app.ids import new_id
from app.intents import create_intent
from app.mandates import CENT, _is_active, format_amount, spent_in_period
from app.models import Agent, AgentRun, Chat, ChatMessage, Mandate, Order, User
from app.service_errors import ServiceError
from app.signing import iso_z, utcnow

router = APIRouter(prefix="/me/chats", tags=["chats"])

HISTORY_TURNS = 8
MAX_PRODUCTS = 6
PRICE_RE = re.compile(r"^\d{1,9}\.\d{2}$")


def _not_found(what: str) -> HTTPException:
    return HTTPException(404, detail={"error": "not_found", "reason": f"{what} not found"})


def _own_chat(db: Session, user: User, chat_id: str) -> Chat:
    chat = db.get(Chat, chat_id)
    if chat is None or chat.user_id != user.id:
        raise _not_found("chat")
    return chat


def agent_rules(db: Session, agent_id: str) -> list[dict[str, Any]]:
    now = utcnow()
    out = []
    for m in db.execute(select(Mandate).where(Mandate.agent_id == agent_id)).scalars():
        if not _is_active(m, now):
            continue
        remaining = max(Decimal(m.budget_amount) - spent_in_period(db, m, now), Decimal("0")).quantize(CENT)
        out.append({
            "id": m.id, "categories": sorted(m.categories or []), "merchants": sorted(m.merchants or []),
            "budget": format_amount(m.budget_amount), "remaining": format_amount(remaining),
            "period": m.budget_period, "currency": m.currency,
        })
    return out


def _clean_url(v: Any, limit: int) -> Optional[str]:
    return v[:limit] if isinstance(v, str) and v.startswith("https://") else None


def _clean_products(raw: Any) -> list[dict[str, Any]]:
    out = []
    for p in raw if isinstance(raw, list) else []:
        if not isinstance(p, dict) or not isinstance(p.get("product_id"), str):
            continue
        price = str(p.get("price", ""))
        if not PRICE_RE.match(price):
            continue
        out.append({
            "product_id": p["product_id"][:128],
            "title": str(p.get("title") or "")[:200],
            "brand": str(p["brand"])[:80] if p.get("brand") else None,
            "price": price,
            "currency": str(p.get("currency") or "USD")[:3],
            "merchant": str(p.get("merchant") or "")[:64],
            "category": str(p.get("category") or "")[:64],
            "category_title": str(p["category_title"])[:64] if p.get("category_title") else None,
            "image": _clean_url(p.get("image"), 1000),
            "url": _clean_url(p.get("url"), 2048),
        })
        if len(out) >= MAX_PRODUCTS:
            break
    return out


def _message_view(m: ChatMessage, runs: dict[str, dict]) -> dict[str, Any]:
    return {
        "id": m.id, "role": m.role, "content": m.content, "products": m.products or [],
        "created_at": iso_z(m.created_at), "run": runs.get(m.run_id) if m.run_id else None,
    }


def _runs_for(db: Session, messages: list[ChatMessage]) -> dict[str, dict]:
    ids = [m.run_id for m in messages if m.run_id]
    if not ids:
        return {}
    runs = db.execute(select(AgentRun).where(AgentRun.id.in_(ids))).scalars().all()
    order_ids = [r.order_id for r in runs if r.order_id]
    orders = {o.id: o for o in db.execute(select(Order).where(Order.id.in_(order_ids))).scalars()} if order_ids else {}
    return {r.id: hosted_agents.run_to_dict(r, orders.get(r.order_id)) for r in runs}


def _agent_view(a: Optional[Agent]) -> Optional[dict[str, Any]]:
    if a is None:
        return None
    return {"id": a.id, "name": a.name, "managed": bool(a.managed), "active": a.revoked_at is None}


def _add(db: Session, chat: Chat, role: str, content: str, **extra) -> ChatMessage:
    m = ChatMessage(id=new_id("msg"), chat_id=chat.id, role=role, content=content[:4000],
                    created_at=utcnow(), **extra)
    db.add(m)
    chat.updated_at = m.created_at
    return m


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #

@router.get("")
def list_chats(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    chats = db.execute(
        select(Chat).where(Chat.user_id == user.id).order_by(Chat.updated_at.desc()).limit(100)
    ).scalars().all()
    if not chats:
        return []
    last = {}
    for m in db.execute(
        select(ChatMessage).where(ChatMessage.chat_id.in_([c.id for c in chats])).order_by(ChatMessage.created_at)
    ).scalars():
        last[m.chat_id] = m
    return [{"id": c.id, "title": c.title, "agent_id": c.agent_id, "updated_at": iso_z(c.updated_at),
             "preview": (last[c.id].content[:120] if c.id in last else "")} for c in chats]


class ChatCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: Optional[str] = Field(default=None, max_length=64)


@router.post("", status_code=201)
def create_chat(body: ChatCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.agent_id:
        agent = db.get(Agent, body.agent_id)
        if agent is None or agent.user_id != user.id:
            raise _not_found("agent")
    else:
        agent = db.execute(
            select(Agent).where(Agent.user_id == user.id, Agent.managed.is_(True), Agent.revoked_at.is_(None))
            .order_by(Agent.created_at.desc())
        ).scalars().first()
    if agent is None or not agent.managed or agent.revoked_at is not None:
        raise HTTPException(409, detail={"error": "no_hosted_agent",
                                         "reason": "Create a hosted agent first. It's the one that shops in chat."})
    now = utcnow()
    chat = Chat(id=new_id("cht"), user_id=user.id, agent_id=agent.id, title="New chat", created_at=now, updated_at=now)
    db.add(chat)
    db.commit()
    return {"id": chat.id, "title": chat.title, "agent_id": agent.id, "updated_at": iso_z(now), "preview": ""}


@router.get("/{chat_id}")
def get_chat(chat_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    chat = _own_chat(db, user, chat_id)
    msgs = db.execute(
        select(ChatMessage).where(ChatMessage.chat_id == chat.id).order_by(ChatMessage.created_at)
    ).scalars().all()
    runs = _runs_for(db, msgs)
    return {
        "id": chat.id, "title": chat.title, "agent": _agent_view(db.get(Agent, chat.agent_id)),
        "rules": agent_rules(db, chat.agent_id), "messages": [_message_view(m, runs) for m in msgs],
    }


@router.delete("/{chat_id}")
def delete_chat(chat_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    chat = _own_chat(db, user, chat_id)
    db.execute(delete(ChatMessage).where(ChatMessage.chat_id == chat.id))
    db.delete(chat)
    db.commit()
    return {"ok": True}


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    content: str = Field(min_length=1, max_length=1000)


def _history(db: Session, chat: Chat) -> list[dict[str, str]]:
    rows = db.execute(
        select(ChatMessage).where(ChatMessage.chat_id == chat.id)
        .order_by(ChatMessage.created_at.desc()).limit(HISTORY_TURNS)
    ).scalars().all()
    out = []
    for m in reversed(rows):
        text = m.content[:600]
        if m.products:
            text += " [shown: " + "; ".join(f"{p['title'][:60]} ${p['price']} at {p['merchant']}" for p in m.products[:6]) + "]"
        out.append({"role": m.role, "content": text})
    return out


@router.post("/{chat_id}/messages")
def send_message(chat_id: str, body: MessageIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    chat = _own_chat(db, user, chat_id)
    history = _history(db, chat)
    mine = _add(db, chat, "user", body.content)
    if chat.title == "New chat":
        chat.title = body.content[:60] + ("…" if len(body.content) > 60 else "")
    db.commit()

    agent = db.get(Agent, chat.agent_id)
    rules = agent_rules(db, chat.agent_id)
    if agent is None or not agent.managed or agent.revoked_at is not None:
        reply = _add(db, chat, "assistant", "This chat's agent is disconnected. Start a new chat with an active hosted agent.")
    elif not rules:
        reply = _add(db, chat, "assistant",
                     "Your agent has no active spending rule yet, so it can't buy anything. "
                     "Add one under Spending rules (categories, stores and a budget) and ask again.")
    else:
        try:
            data = hosted_agents.suggest(agent.id, body.content, history, rules)
            products = _clean_products(data.get("products"))
            text = str(data.get("reply") or "").strip()[:2000] or (
                "Here's what I found." if products else "I couldn't find anything that fits.")
            reply = _add(db, chat, "assistant", text, products=products or None)
        except hosted_agents.HostedAgentError as e:
            reply = _add(db, chat, "assistant", e.message)
    db.commit()
    return {"messages": [_message_view(mine, {}), _message_view(reply, {})], "title": chat.title}


class BuyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message_id: str = Field(min_length=1, max_length=64)
    product_id: str = Field(min_length=1, max_length=128)
    qty: int = Field(default=1, ge=1, le=20)


@router.post("/{chat_id}/buy")
def buy(chat_id: str, body: BuyIn, background: BackgroundTasks, user: User = Depends(current_user),
        db: Session = Depends(get_db)):
    chat = _own_chat(db, user, chat_id)
    shown = db.get(ChatMessage, body.message_id)
    if shown is None or shown.chat_id != chat.id or shown.role != "assistant":
        raise _not_found("message")
    product = next((p for p in (shown.products or []) if p.get("product_id") == body.product_id), None)
    if product is None:
        raise _not_found("product")
    agent = db.get(Agent, chat.agent_id)
    if agent is None or not agent.managed or agent.revoked_at is not None:
        raise HTTPException(409, detail={"error": "agent_unavailable", "reason": "This chat's agent is disconnected."})

    asked = db.execute(
        select(ChatMessage).where(ChatMessage.chat_id == chat.id, ChatMessage.role == "user",
                                  ChatMessage.created_at <= shown.created_at)
        .order_by(ChatMessage.created_at.desc()).limit(1)
    ).scalars().first()
    request_text = (
        f"{asked.content if asked else ''}\n\n"
        f"I chose: {product['title']} from {product['merchant']} at ${product['price']} each, quantity {body.qty}."
    ).strip()[:2000]
    try:
        intent = create_intent(db, user_id=user.id, agent_id=agent.id, request_text=request_text)
    except ServiceError as e:
        raise HTTPException(e.status_code, detail={"error": e.error, "reason": e.reason})
    run = hosted_agents.start_run(db, intent.id, user.id, agent.id, product_id=body.product_id, qty=body.qty)
    msg = _add(db, chat, "assistant",
               f"Buying {body.qty} × {product['title']} from {product['merchant']}. "
               "Secay checks the order against your request and rules before anything is paid.",
               intent_id=intent.id, run_id=run.id)
    db.commit()
    background.add_task(hosted_agents.execute_run, run.id)
    return _message_view(msg, {run.id: hosted_agents.run_to_dict(run)})
