"""Limits against payment-action abuse and approval fatigue (threats 23, 24, 26).

Counts come from the database, so they hold across restarts and API instances.
"""
from __future__ import annotations

import os
from datetime import timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import Chat, ChatMessage, Intent, Order, UserSession
from app.signing import utcnow

# Defaults; each can be changed on the running service with an env var of the same name.
CHAT_MESSAGES_PER_MINUTE = 12      # per user, across chats
CART_CHECKOUTS_PER_HOUR = 20       # approved carts per user
AGENT_ORDERS_PER_DAY = 100         # orders one agent may create (failed/rejected ones don't count)
PENDING_APPROVALS_PER_AGENT = 5    # more holds than this are voided, not queued for a tired human
HIGH_VALUE = Decimal("100.00")     # approving an order this large needs its total typed back
FRESH_SIGN_IN = timedelta(minutes=15)  # payment-method changes need a sign-in this recent


NOT_PAYMENT_ACTIONS = ("failed", "rejected")  # never reached PayPal


def _limit(name: str) -> int:
    try:
        return max(int(os.environ.get(name, globals()[name])), 0)
    except (TypeError, ValueError):
        return globals()[name]


def _slow_down(reason: str) -> HTTPException:
    return HTTPException(429, detail={"error": "rate_limited", "reason": reason})


def check_chat_rate(db, user_id: str) -> None:
    n = db.execute(
        select(func.count()).select_from(ChatMessage).join(Chat, Chat.id == ChatMessage.chat_id)
        .where(Chat.user_id == user_id, ChatMessage.role == "user",
               ChatMessage.created_at >= utcnow() - timedelta(minutes=1))
    ).scalar_one()
    if n >= _limit("CHAT_MESSAGES_PER_MINUTE"):
        raise _slow_down("You're sending messages very fast. Wait a minute and try again.")


def check_cart_checkout_rate(db, user_id: str) -> None:
    n = db.execute(
        select(func.count()).select_from(Intent)
        .where(Intent.user_id == user_id, Intent.approved_cart.is_not(None),
               Intent.signed_at >= utcnow() - timedelta(hours=1))
    ).scalar_one()
    if n >= _limit("CART_CHECKOUTS_PER_HOUR"):
        raise _slow_down("That's a lot of purchases in one hour. Try again later.")


def check_agent_order_rate(db, agent_id: str) -> None:
    n = db.execute(
        select(func.count()).select_from(Order)
        .where(Order.agent_id == agent_id, Order.created_at >= utcnow() - timedelta(days=1),
               Order.status.notin_(NOT_PAYMENT_ACTIONS))
    ).scalar_one()
    limit = _limit("AGENT_ORDERS_PER_DAY")
    if n >= limit:
        raise _slow_down(f"This agent has reached its limit of {limit} orders in 24 hours. Try again later, "
                         "or raise AGENT_ORDERS_PER_DAY.")


def pending_approvals(db, agent_id: str, exclude_order_id: str | None = None) -> int:
    q = select(func.count()).select_from(Order).where(Order.agent_id == agent_id, Order.status == "pending_approval")
    if exclude_order_id:
        q = q.where(Order.id != exclude_order_id)
    return db.execute(q).scalar_one()


def require_fresh_sign_in(sess: UserSession) -> None:
    created = sess.created_at
    if created.tzinfo is None:
        from datetime import timezone
        created = created.replace(tzinfo=timezone.utc)
    if utcnow() - created > FRESH_SIGN_IN:
        raise HTTPException(403, detail={"error": "reauth_required",
                                         "reason": "For your security, sign in again to change your payment method."})


def require_typed_total(order_total, typed: str | None) -> None:
    total = Decimal(str(order_total)).quantize(Decimal("0.01"))
    if total < HIGH_VALUE:
        return
    try:
        ok = typed is not None and Decimal(str(typed).replace("$", "").replace(",", "").strip()) == total
    except Exception:  # noqa: BLE001
        ok = False
    if not ok:
        raise HTTPException(422, detail={"error": "confirm_total_required",
                                         "reason": f"Type the order total (${total}) to approve an order this large."})
