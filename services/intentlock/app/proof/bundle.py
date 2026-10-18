"""Assemble the Proof of Intent bundle (plans/CONTRACTS.md) from DB rows. Data only, no secrets."""
from __future__ import annotations

import math
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select

from app.intents import intent_to_dict
from app.mandates import format_amount, select_mandate_for_agent
from app.models import Approval, Check, Intent, Order
from app.signing import iso_z, utcnow

STEP_ORDER = (
    "verify_agent", "check_mandate", "authorize_payment", "scan_injection", "intent_diff",
    "graph_risk", "decide", "capture_or_void", "build_proof",
)


class OrderNotFound(LookupError):
    pass


def normalize(v: Any) -> Any:
    """Make values JSON-stable across Python and JS: integral floats become ints, non-finite become None,
    Decimals become strings, datetimes become ISO Z strings."""
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    if isinstance(v, float):
        if not math.isfinite(v):
            return None
        # 4 dp keeps |v| >= 1e-4, where Python repr and JS/RFC 8785 number text agree (no 1.2e-05 vs 0.000012).
        v = round(v, 4)
        return int(v) if v == int(v) else v
    if isinstance(v, Decimal):
        return format_amount(v)
    if isinstance(v, datetime):
        return iso_z(v)
    if isinstance(v, dict):
        return {str(k): normalize(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [normalize(x) for x in v]
    return str(v)


def _iso(dt: datetime | None) -> str | None:
    return iso_z(dt) if dt is not None else None


def _score(v: Any) -> Any:
    return None if v is None else normalize(float(v))


def _cart(order: Order) -> list:
    out = []
    for line in order.cart_json or []:
        line = dict(line)
        for k in ("unit_price", "line_total"):
            if k in line and line[k] is not None:
                line[k] = format_amount(Decimal(str(line[k])))
        out.append(normalize(line))
    return out


def _checks(db, order_id: str) -> list:
    rows = db.execute(select(Check).where(Check.order_id == order_id)).scalars().all()
    rows = [r for r in rows if r.step != "build_proof"]
    rows.sort(key=lambda r: (STEP_ORDER.index(r.step) if r.step in STEP_ORDER else len(STEP_ORDER),
                             r.created_at, r.id))
    return [
        {"step": r.step, "result": r.result, "score": _score(r.score),
         "details": normalize(r.details_json), "duration_ms": r.duration_ms}
        for r in rows
    ]


def _decision(order: Order) -> str:
    if order.decision in ("capture", "void", "hold", "reject"):
        return order.decision
    return "reject"  # failed before a decision was reached; nothing was captured


def build_bundle(db, order_id: str, now: datetime | None = None) -> dict:
    order = db.get(Order, order_id)
    if order is None:
        raise OrderNotFound(order_id)
    intent = db.get(Intent, order.intent_id)
    mandate = select_mandate_for_agent(db, order.agent_id, order.merchant, now=order.created_at)
    approval = db.execute(select(Approval).where(Approval.order_id == order_id)).scalar_one_or_none()
    i = intent_to_dict(intent) if intent is not None else {}
    return {
        "version": 1,
        "order": {
            "id": order.id,
            "intent_id": order.intent_id,
            "agent_id": order.agent_id,
            "user_id": order.user_id,
            "merchant": order.merchant,
            "total": format_amount(order.total),
            "currency": order.currency,
            "status": order.status,
            "created_at": _iso(order.created_at),
        },
        "intent": {k: i.get(k) for k in ("id", "request_text", "signed_at", "signature")},
        "mandate": ({"id": mandate.id, "signed_json": normalize(mandate.signed_json),
                     "signature": mandate.signature} if mandate is not None else None),
        "cart": _cart(order),
        "page_urls": list(order.page_urls or []),
        "checks": _checks(db, order_id),
        "decision": _decision(order),
        "approval": ({"id": approval.id, "order_id": approval.order_id, "decision": approval.decision,
                      "requested_at": _iso(approval.requested_at), "decided_at": _iso(approval.decided_at),
                      "expires_at": _iso(approval.expires_at)} if approval is not None else None),
        "paypal": {
            "order_id": order.paypal_order_id,
            "authorization_id": order.authorization_id,
            "capture_id": order.capture_id,
            "void": order.status == "voided",
        },
        "astropods_trace_id": order.trace_id,
        "issued_at": iso_z(now or utcnow()),
    }
