"""Pipeline step helpers: checks rows, result mappers, status transitions, approvals."""
from __future__ import annotations

import logging
import math
import time
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy import select

from app.ids import new_id
from app.models import Approval, Check
from app.pipeline import limits

log = logging.getLogger("intentlock.pipeline")

ALL_STEPS = (
    "verify_agent", "check_mandate", "authorize_payment", "scan_injection", "intent_diff",
    "graph_risk", "decide", "capture_or_void", "build_proof",
)
TRANSITIONS = {
    "received": {"rejected", "authorized", "failed"},
    "authorized": {"checking", "failed"},
    "checking": {"captured", "voided", "pending_approval", "failed"},
    "pending_approval": {"captured", "voided", "failed"},
}


class InvalidTransition(ValueError):
    pass


def ms_since(t0: float) -> int:
    return max(0, int((time.perf_counter() - t0) * 1000))


def _is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _score(v: Any):
    if not _is_num(v) or not (0 <= v <= 999.99):
        return None
    return Decimal(str(round(float(v), 2)))


def set_status(order, new: str, history: list) -> None:
    if new not in TRANSITIONS.get(order.status, set()):
        raise InvalidTransition(f"{order.status}->{new}")
    order.status = new
    history.append(new)


def record_check(db, order_id: str, step: str, result: str, details: dict | None,
                 duration_ms: int, score: Any = None) -> Check:
    row = Check(id=new_id("chk"), order_id=order_id, step=step, result=result,
                score=_score(score), details_json=details, duration_ms=int(duration_ms))
    db.add(row)
    return row


def record_skipped(db, order_id: str, steps: Iterable[str], reason: str) -> None:
    for s in steps:
        record_check(db, order_id, s, "skipped", {"reason": reason}, 0)


def injection_result(out: dict) -> tuple[str, Any]:
    conf = out.get("confidence")
    if out.get("result") == "error" or not _is_num(conf) or not (0 <= conf <= 1):
        return "error", None
    if out.get("detected"):
        return "flag", conf
    return "pass", conf


def intent_diff_result(out: dict) -> tuple[str, Any]:
    items = out.get("items")
    if (out.get("result") == "error" or not isinstance(items, list) or not items
            or not all(isinstance(i, dict) for i in items)):
        return "error", None
    if any(i.get("explained") != "yes" for i in items) or out.get("price_anomaly"):
        return "flag", None
    return "pass", None


def graph_result(out: dict) -> tuple[str, Any]:
    s = out.get("score")
    if out.get("result") == "error" or not _is_num(s) or not (0 <= s <= 100):
        return "error", None
    if s >= 30:
        return "flag", s
    return "pass", s


def decision_result(d: str) -> str:
    return {"capture": "pass", "hold": "flag"}.get(d, "fail")


def ensure_approval(db, order, now: datetime) -> Approval:
    existing = db.execute(select(Approval).where(Approval.order_id == order.id)).scalar_one_or_none()
    if existing is not None:
        return existing
    appr = Approval(id=new_id("apr"), order_id=order.id, requested_at=now,
                    expires_at=now + timedelta(minutes=limits.approval_timeout_min()),
                    decision=None, decided_at=None)
    db.add(appr)
    return appr


def build_proof_step(db, order_id: str) -> None:
    t0 = time.perf_counter()
    try:
        from app.proof import issue_proof  # P1-T11 provides issue_proof(db, order_id) -> proof_id
    except ImportError:
        record_check(db, order_id, "build_proof", "skipped", {"reason": "proof_module_missing"}, ms_since(t0))
        db.commit()
        return
    try:
        proof_id = issue_proof(db, order_id)
        record_check(db, order_id, "build_proof", "pass", {"proof_id": str(proof_id)}, ms_since(t0))
    except Exception:
        log.warning("pipeline.build_proof_failed order_id=%s", order_id)
        db.rollback()
        record_check(db, order_id, "build_proof", "error", {"error": "proof_failed"}, ms_since(t0))
    db.commit()
