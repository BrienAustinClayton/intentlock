"""Build the fraud graph from the lab seed and Postgres.

The graph is rebuilt per risk call (it is small). Merchant flags written by
``flag_merchant`` persist in a JSON file (``INTENTLOCK_GRAPH_FLAGS_PATH``) and are
re-applied on every build.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .store import NetworkXStore

REPO_ROOT = Path(__file__).resolve().parents[3]
HOST_RE = re.compile(r"^[a-z0-9.-]{1,253}$")
SLUG_RE = re.compile(r"^[a-z0-9._-]{1,64}$")

_flags_lock = threading.Lock()
_MEM_FLAGS: dict[str, dict[str, Any]] = {}


def seed_path() -> Path:
    return Path(os.environ.get("INTENTLOCK_GRAPH_SEED") or REPO_ROOT / "data" / "lab" / "graph_seed.json")


def flags_path() -> Path:
    return Path(os.environ.get("INTENTLOCK_GRAPH_FLAGS_PATH") or REPO_ROOT / "data" / "graph_flags.json")


def merchant_slug(merchant: Any) -> str | None:
    if not isinstance(merchant, str):
        return None
    s = merchant.strip().lower()
    if s.startswith("merchant_"):
        s = s[len("merchant_"):]
    return s if SLUG_RE.match(s) else None


def merchant_node_id(merchant: Any) -> str | None:
    slug = merchant_slug(merchant)
    return f"merchant_{slug}" if slug else None


def key_node_id(public_key: str) -> str:
    return "key_" + hashlib.sha256(public_key.encode()).hexdigest()[:16]


def to_utc(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# --------------------------------------------------------------------------- flags
def _read_flag_file() -> dict[str, dict[str, Any]]:
    try:
        data = json.loads(flags_path().read_text())
        if isinstance(data, dict):
            return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, dict)}
    except Exception:
        pass
    return {}


def record_flag(merchant: str, host: str | None) -> dict[str, Any]:
    slug = merchant_slug(merchant)
    if slug is None:
        raise ValueError("invalid merchant")
    with _flags_lock:
        flags = {**_read_flag_file(), **_MEM_FLAGS}
        entry = dict(flags.get(slug) or {})
        hosts = [h for h in entry.get("hosts", []) if isinstance(h, str)]
        if host and host not in hosts:
            hosts.append(host)
        entry = {"flagged": True, "reason": "injection_detected", "hosts": hosts[-10:]}
        _MEM_FLAGS[slug] = entry
        try:
            p = flags_path()
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps({**_read_flag_file(), slug: entry}, indent=2, sort_keys=True))
        except Exception:
            pass  # memory flag still holds for this process
        return entry


def apply_flags(store: NetworkXStore) -> None:
    with _flags_lock:
        flags = {**_read_flag_file(), **_MEM_FLAGS}
    for slug, entry in flags.items():
        if not SLUG_RE.match(slug) or not entry.get("flagged"):
            continue
        store.upsert_node(
            f"merchant_{slug}", "merchant", name=slug, flagged=True,
            flag_reason=str(entry.get("reason", "flagged"))[:80],
        )


def host_of(url: Any) -> str | None:
    try:
        host = urlparse(str(url)).hostname
    except Exception:
        return None
    return host if host and HOST_RE.match(host) else None


# --------------------------------------------------------------------------- seed
_SEED_TYPES = {"key_fingerprint": "key"}


def load_seed(store: NetworkXStore, path: Path | None = None) -> None:
    data = json.loads((path or seed_path()).read_text())
    for n in data.get("nodes", []):
        attrs = {k: v for k, v in n.items() if k not in ("id", "type")}
        ntype = _SEED_TYPES.get(n["type"], n["type"])
        if ntype == "agent":
            attrs.setdefault("verified", False)
            attrs["revoked"] = bool(attrs.get("revoked", False))
        store.upsert_node(n["id"], ntype, **attrs)
        if ntype == "user" and n.get("familiar_device"):
            store.upsert_node(n["familiar_device"], "device")
            store.upsert_edge(n["id"], n["familiar_device"], "FAMILIAR_DEVICE")
    for e in data.get("edges", []):
        attrs = {k: v for k, v in e.items() if k not in ("source", "target", "type")}
        if store.has_node(e["source"]) and store.has_node(e["target"]):
            store.upsert_edge(e["source"], e["target"], e["type"], **attrs)
    # agent device ids declared on seed nodes
    for aid in store.nodes("agent"):
        dev = (store.get_node(aid) or {}).get("device_id")
        if dev and store.has_node(dev):
            store.upsert_edge(aid, dev, "USES_DEVICE")


# --------------------------------------------------------------------------- postgres
def load_postgres(
    store: NetworkXStore, db: Any, around: datetime | None = None, window: timedelta = timedelta(days=2)
) -> None:
    """Add users, agents, keys, devices, mandates, orders, failed-mandate checks."""
    from sqlalchemy import select

    from app.models import Agent, Check, Mandate, Order, User  # type: ignore

    around = around or datetime.now(timezone.utc)
    lo, hi = around - window, around + timedelta(hours=1)

    for u in db.execute(select(User)).scalars():
        store.upsert_node(u.id, "user", name=u.name)
    for a in db.execute(select(Agent)).scalars():
        store.upsert_node(
            a.id, "agent", name=a.name, user_id=a.user_id, device_id=a.device_id,
            verified=bool(a.verified), revoked=a.revoked_at is not None,
        )
        if not store.has_node(a.user_id):
            store.upsert_node(a.user_id, "user")
        store.upsert_edge(a.user_id, a.id, "OWNS")
        if not store.has_node(a.device_id):
            store.upsert_node(a.device_id, "device")
        store.upsert_edge(a.id, a.device_id, "USES_DEVICE")
        if a.public_key:
            kid = key_node_id(a.public_key)
            store.upsert_node(kid, "key", fingerprint=kid)
            store.upsert_edge(a.id, kid, "USES_KEY")
        if a.verified and a.revoked_at is None:
            store.upsert_edge(a.user_id, a.device_id, "FAMILIAR_DEVICE")
    for m in db.execute(select(Mandate)).scalars():
        store.upsert_node(m.id, "mandate", revoked=m.revoked_at is not None)
        if store.has_node(m.agent_id):
            store.upsert_edge(m.agent_id, m.id, "HAS_MANDATE")

    orders = db.execute(
        select(Order).where(Order.created_at >= lo, Order.created_at <= hi)
    ).scalars().all()
    ids = [o.id for o in orders]
    failed = set()
    if ids:
        failed = set(
            db.execute(
                select(Check.order_id).where(
                    Check.order_id.in_(ids), Check.step == "check_mandate", Check.result == "fail"
                )
            ).scalars()
        )
    for o in orders:
        add_order(store, o.id, o.agent_id, o.merchant, to_utc(o.created_at), mandate_failed=o.id in failed)


def add_order(
    store: NetworkXStore, order_id: str, agent_id: str | None, merchant: Any,
    created_at: datetime | None, mandate_failed: bool = False,
) -> None:
    store.upsert_node(order_id, "order", created_at=created_at, mandate_failed=mandate_failed)
    if agent_id and store.has_node(agent_id):
        store.upsert_edge(agent_id, order_id, "PLACED_ORDER")
    mid = merchant_node_id(merchant)
    if mid:
        if not store.has_node(mid):
            store.upsert_node(mid, "merchant", name=merchant_slug(merchant), flagged=False)
        store.upsert_edge(order_id, mid, "ORDER_AT", created_at=created_at)


def build_store(db: Any = None, around: datetime | None = None, use_seed: bool = True) -> NetworkXStore:
    store = NetworkXStore()
    if use_seed:
        load_seed(store)
    if db is not None:
        load_postgres(store, db, around)
    apply_flags(store)
    return store
