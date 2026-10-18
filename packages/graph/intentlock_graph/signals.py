"""Risk signals. Each returns ``(weight 0-100, evidence node ids)`` or ``None``."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .store import NetworkXStore, uniq

Signal = tuple[int, list[str]] | None
MAX_EVIDENCE = 25
BOT_WINDOW = timedelta(minutes=15)
MANDATE_WINDOW = timedelta(hours=24)


def _agent_ok(store: NetworkXStore, aid: str) -> bool:
    n = store.get_node(aid)
    return bool(n) and n.get("type") == "agent" and not n.get("revoked")


def _key_group(store: NetworkXStore, agent_id: str, key_id: str) -> list[str]:
    """Non-revoked agents on a key. Verified agents are only compared with other verified ones,
    so the legitimate owner of a key is not penalised for copies made by unverified agents."""
    me = store.get_node(agent_id) or {}
    verified = bool(me.get("verified"))
    return [
        a for a in store.neighbors(key_id, "USES_KEY", "in")
        if _agent_ok(store, a) and (not verified or bool((store.get_node(a) or {}).get("verified")))
    ]


def shared_key(store: NetworkXStore, ctx: dict[str, Any]) -> Signal:
    aid = ctx.get("agent_id")
    if not aid or not _agent_ok(store, aid):
        return None
    best: Signal = None
    for kid in store.neighbors(aid, "USES_KEY", "out"):
        group = _key_group(store, aid, kid)
        if aid not in group:
            group.append(aid)
        n = len(group)
        if n > 1:
            w = min(70, 40 + 5 * (n - 1))
            if best is None or w > best[0]:
                best = (w, uniq([kid, aid] + sorted(group))[:MAX_EVIDENCE])
    return best


def _cluster(store: NetworkXStore, agent_id: str) -> tuple[list[str], list[str]]:
    """Agents sharing a device or key with ``agent_id`` (incl. itself) and the shared nodes."""
    members = {agent_id}
    shared: list[str] = []
    for dev in store.neighbors(agent_id, "USES_DEVICE", "out"):
        others = [a for a in store.neighbors(dev, "USES_DEVICE", "in") if _agent_ok(store, a)]
        if len(others) > 1:
            shared.append(dev)
        members.update(others)
    for kid in store.neighbors(agent_id, "USES_KEY", "out"):
        others = _key_group(store, agent_id, kid)
        if len(others) > 1:
            shared.append(kid)
        members.update(others)
    return sorted(members), shared


def bot_farm(store: NetworkXStore, ctx: dict[str, Any]) -> Signal:
    aid, mid, when = ctx.get("agent_id"), ctx.get("merchant_id"), ctx.get("created_at")
    if not aid or not mid or not _agent_ok(store, aid) or not store.has_node(mid):
        return None
    members, shared = _cluster(store, aid)
    if len(members) < 5:
        return None
    active: list[str] = []
    order_ids: list[str] = []
    rapid = False
    member_set = set(members)
    for e in store.edges(mid, "ORDER_AT", "in"):
        t = e.get("created_at")
        if not isinstance(t, datetime) or not isinstance(when, datetime) or abs(t - when) > BOT_WINDOW:
            continue
        for a in store.neighbors(e["source"], "PLACED_ORDER", "in"):
            if a in member_set:
                active.append(a)
                order_ids.append(e["source"])
    for m in members:
        for e in store.edges(m, "RAPID_ORDERS", "out"):
            w = e.get("time_window_min")
            if e["target"] == mid and isinstance(w, (int, float)) and 0 < w <= BOT_WINDOW.total_seconds() / 60:
                rapid = True
                active.append(m)
    n_active = len(set(active))
    if n_active < 5 and not rapid:
        return None
    size = max(len(members), n_active)
    weight = min(80, 60 + 2 * (size - 5))
    return weight, uniq(shared + members + order_ids + [mid])[:MAX_EVIDENCE]


def unfamiliar_device(store: NetworkXStore, ctx: dict[str, Any]) -> Signal:
    uid, dev = ctx.get("user_id"), ctx.get("device_id")
    if not uid or not dev or not store.has_node(uid):
        return None
    known = set(store.neighbors(uid, "FAMILIAR_DEVICE", "out"))
    if not known:
        return None  # nothing to compare against (new user)
    node = store.get_node(dev) or {}
    if dev in known or node.get("familiar") is True:
        return None
    return 15, [uid, dev]


def out_of_mandate(store: NetworkXStore, ctx: dict[str, Any]) -> Signal:
    aid, when = ctx.get("agent_id"), ctx.get("created_at")
    if not aid or not store.has_node(aid) or not isinstance(when, datetime):
        return None
    hits = []
    for oid in store.neighbors(aid, "PLACED_ORDER", "out"):
        n = store.get_node(oid) or {}
        t = n.get("created_at")
        if (
            oid != ctx.get("order_id") and n.get("type") == "order" and n.get("mandate_failed")
            and isinstance(t, datetime) and timedelta(0) <= when - t <= MANDATE_WINDOW
        ):
            hits.append(oid)
    return (20, uniq([aid] + sorted(hits))[:MAX_EVIDENCE]) if hits else None


def flagged_merchant(store: NetworkXStore, ctx: dict[str, Any]) -> Signal:
    mid = ctx.get("merchant_id")
    node = store.get_node(mid) if mid else None
    if node and node.get("flagged"):
        return 25, [mid]
    return None


SIGNALS = (
    ("shared_key", shared_key),
    ("bot_farm", bot_farm),
    ("unfamiliar_device", unfamiliar_device),
    ("out_of_mandate", out_of_mandate),
    ("flagged_merchant", flagged_merchant),
)
