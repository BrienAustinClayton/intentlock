"""PayPal sends the buyer back here after they approve (or cancel) an order's payment.

GET /paypal/return?order_id=…&token=<PayPal order id>[&cancelled=1]

Approval authorizes the payment (PayPal also saves the account for the buyer's later agent purchases),
then the checks run in the background and the buyer lands back where they bought.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import runlog
from app.config import web_origins
from app.auth import send_security_notice
from app.db import get_db
from app.models import Chat, ChatMessage, Check, Order, User
from app.paypal import service as paypal
from app.pipeline.core import PAYMENT_FAILED_REASON
from app.pipeline.runner import resume_checkout
from app.pipeline.steps import build_proof_step, record_skipped, set_status

router = APIRouter(tags=["paypal"])
log = logging.getLogger("intentlock.paypal_return")

_ORDER_RE = re.compile(r"^ord_[A-Za-z0-9_]{1,64}$")
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
NOT_APPROVED = frozenset({"ORDER_NOT_APPROVED", "PAYER_ACTION_REQUIRED"})


def _back(db: Session, order: Optional[Order], result: str) -> RedirectResponse:
    web = web_origins()[0]
    if order is None:
        return RedirectResponse(f"{web}/orders", status_code=303)
    chat_id = db.execute(
        select(Chat.id).join(ChatMessage, ChatMessage.chat_id == Chat.id)
        .where(ChatMessage.intent_id == order.intent_id, Chat.user_id == order.user_id).limit(1)
    ).scalar_one_or_none()
    dest = f"/chat?c={chat_id}" if chat_id else f"/orders/{order.id}"
    sep = "&" if "?" in dest else "?"
    return RedirectResponse(f"{web}{dest}{sep}paypal={result}", status_code=303)


@router.get("/paypal/return")
def paypal_return(background: BackgroundTasks, order_id: str = "", token: Optional[str] = None,
                  cancelled: Optional[str] = None, db: Session = Depends(get_db)):
    if not _ORDER_RE.fullmatch(order_id):
        return _back(db, None, "error")
    order = db.execute(
        select(Order).where(Order.id == order_id).with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()
    if order is None:
        db.rollback()
        return _back(db, None, "error")
    if order.status != "awaiting_payment" or not order.paypal_order_id:
        db.commit()
        return _back(db, order, "done")
    if cancelled:
        db.commit()
        return _back(db, order, "cancelled")
    if token is not None and (not _TOKEN_RE.fullmatch(token) or token != order.paypal_order_id):
        db.commit()
        return _back(db, order, "error")

    row = db.execute(
        select(Check).where(Check.order_id == order.id, Check.step == "authorize_payment")
        .order_by(Check.created_at.desc()).limit(1)
    ).scalar_one_or_none()
    details = dict(row.details_json or {}) if row is not None else {}
    try:
        auth_id, saved = paypal.authorize_approved(order.paypal_order_id, f"{order.id}-auth")
    except paypal.PayPalError as e:
        if e.code in NOT_APPROVED:
            db.commit()
            return _back(db, order, "cancelled")
        log.warning("paypal_return.authorize_failed order_id=%s code=%s debug_id=%s", order.id, e.code, e.debug_id)
        if row is not None:
            row.result = "error"
            row.details_json = {**details, "error": e.code[:64], "debug_id": e.debug_id}
        record_skipped(db, order.id, ("scan_injection", "intent_diff", "graph_risk", "decide",
                                      "capture_or_void"), "payment_failed")
        order.reasons = [PAYMENT_FAILED_REASON]
        order.payer_action_url = None
        set_status(order, "failed", [])
        db.commit()
        build_proof_step(db, order.id)
        return _back(db, order, "failed")

    order.authorization_id = auth_id
    order.payer_action_url = None
    if row is not None:
        row.result = "pass"
        row.details_json = {**details, "authorization_id": auth_id, "buyer_approved": True,
                            "saved_for_later": bool(saved)}
    user = db.get(User, order.user_id)
    if saved and user is not None and not paypal.has_saved_payment(user.paypal_payment_token):
        user.paypal_payment_token = saved
        send_security_notice(user.email, "PayPal was saved on your Sepilo account",
                             "Your agents can now pay with this PayPal account, within your spending rules.")
    set_status(order, "authorized", [])
    db.commit()
    runlog.emit("paypal.buyer_approved", order_id=order.id, saved_for_later=bool(saved))
    background.add_task(resume_checkout, order.id)
    return _back(db, order, "approved")
