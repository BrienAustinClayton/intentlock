"""graph_risk(order) -> CONTRACTS graph_risk object. Never raises."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Mapping

from .build import (
    add_order, build_store, host_of, merchant_node_id, record_flag, to_utc,
)
from .signals import SIGNALS
from .store import NetworkXStore

log = logging.getLogger("intentlock_graph")
ORDER_ID_KEY = "order_id"


def error_result() -> dict[str, Any]:
    return {"result": "error", "score": None, "signals": []}


def _get(obj: Any, *names: str) -> Any:
    for n in names:
        v = obj.get(n) if isinstance(obj, Mapping) else getattr(obj, n, None)
        if v is not None:
            return v
    return None


def _str(v: Any) -> str | None:
    return v if isinstance(v, str) and 0 < len(v) <= 128 else None


def normalize(order: Any) -> dict[str, Any] | None:
    """Pull order fields out of an ORM Order, a dict, or a CheckoutRequest-like object."""
    if order is None or isinstance(order, (str, bytes, int, float, list, tuple, set)):
        return None
    oid = _str(_get(order, "order_id", "id"))
    ctx = {
        "order_id": oid,
        "agent_id": _str(_get(order, "agent_id")),
        "user_id": _str(_get(order, "user_id")),
        "device_id": _str(_get(order, "device_id")),
        "merchant_id": merchant_node_id(_get(order, "merchant")),
        "created_at": to_utc(_get(order, "created_at")),
    }
    if not any(ctx[k] for k in ("order_id", "agent_id", "merchant_id")):
        return None
    return ctx


def _default_db_session() -> Any | None:
    """Own session when DATABASE_URL is configured. None => seed-only graph."""
    try:
        from app.db import _get_session_factory, get_engine  # type: ignore
    except Exception:
        return None
    try:
        get_engine()  # reads DATABASE_URL (KeyError when unset)
    except KeyError:
        return None
    return _get_session_factory()()


def _enrich_from_db(ctx: dict[str, Any], db: Any) -> None:
    """Fill missing fields from the orders/agents tables when an order id is known."""
    from app.models import Agent, Order  # type: ignore

    o = db.get(Order, ctx["order_id"]) if ctx.get("order_id") else None
    if o is not None:
        ctx["agent_id"] = ctx["agent_id"] or o.agent_id
        ctx["user_id"] = ctx["user_id"] or o.user_id
        ctx["merchant_id"] = ctx["merchant_id"] or merchant_node_id(o.merchant)
        ctx["created_at"] = ctx["created_at"] or to_utc(o.created_at)
    if ctx.get("agent_id") and not (ctx["user_id"] and ctx["device_id"]):
        a = db.get(Agent, ctx["agent_id"])
        if a is not None:
            ctx["user_id"] = ctx["user_id"] or a.user_id
            ctx["device_id"] = ctx["device_id"] or a.device_id


def _compute(store: NetworkXStore, ctx: dict[str, Any]) -> dict[str, Any]:
    store = store.copy()
    agent = store.get_node(ctx["agent_id"]) if ctx.get("agent_id") else None
    if agent:
        ctx["user_id"] = ctx.get("user_id") or agent.get("user_id")
        ctx["device_id"] = ctx.get("device_id") or agent.get("device_id")
    add_order(store, ctx["order_id"] or "order_current", ctx.get("agent_id"), None, ctx["created_at"])
    if ctx.get("merchant_id"):
        mname = ctx["merchant_id"]
        if not store.has_node(mname):
            store.upsert_node(mname, "merchant", name=mname[len("merchant_"):], flagged=False)
        store.upsert_edge(ctx["order_id"] or "order_current", mname, "ORDER_AT", created_at=ctx["created_at"])
    signals = []
    for name, fn in SIGNALS:
        res = fn(store, ctx)
        if res is None:
            continue
        weight, evidence = res
        signals.append({"name": name, "weight": max(0, min(100, int(weight))), "evidence": list(evidence)})
    signals.sort(key=lambda s: -s["weight"])
    if signals:
        top, rest = signals[0]["weight"], sum(s["weight"] for s in signals[1:])
        score = min(100.0, top + 0.3 * rest)
    else:
        score = 0.0
    return {"score": round(score, 1), "signals": signals}


def graph_risk(order_or_dict: Any, db: Any = None, store: NetworkXStore | None = None) -> dict[str, Any]:
    """Risk score and evidence for one order. On any internal error returns
    ``{"result": "error", "score": None, "signals": []}`` so the policy holds the order.

    ``order_or_dict``: ORM Order, dict, or object with agent_id/merchant/(order_id, user_id,
    device_id, created_at). ``store`` overrides the graph (tests); otherwise the graph is
    built from the lab seed plus Postgres (``db`` or the service's own session).
    """
    own_session = None
    try:
        ctx = normalize(order_or_dict)
        if ctx is None:
            return error_result()
        if store is None:
            session = db
            if session is None:
                session = own_session = _default_db_session()
            if session is not None:
                _enrich_from_db(ctx, session)
            ctx["created_at"] = ctx.get("created_at") or datetime.now(timezone.utc)
            store = build_store(session, around=ctx["created_at"])
        else:
            ctx["created_at"] = ctx.get("created_at") or datetime.now(timezone.utc)
        return _compute(store, ctx)
    except Exception:
        log.exception("graph_risk failed")
        return error_result()
    finally:
        if own_session is not None:
            try:
                own_session.close()
            except Exception:
                pass


def flag_merchant(merchant: Any, url: Any = None) -> bool:
    """Mark a merchant as flagged (injection found on its pages). Never raises; True on success."""
    try:
        record_flag(merchant, host_of(url) if url else None)
        return True
    except Exception:
        log.exception("flag_merchant failed")
        return False
