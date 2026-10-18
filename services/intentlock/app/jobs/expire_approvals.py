"""Expire approvals job: void held orders whose approval window has closed.

Runs every 60 s via FastAPI lifespan (started in app/main.py).
Also callable as: python -m app.jobs.expire_approvals
"""
from __future__ import annotations

import asyncio
import logging
import sys
from datetime import timezone

from sqlalchemy import select

log = logging.getLogger("intentlock.jobs.expire_approvals")


def _utcnow():
    from app.signing import utcnow
    return utcnow()


def _expire_batch(db) -> int:
    """Expire all pending approvals using the given DB session. Returns the number voided."""
    from app.models import Approval, Order
    from app.paypal import service as paypal
    from app.pipeline.steps import build_proof_step, set_status

    now = _utcnow()
    rows = db.execute(
        select(Approval).where(
            Approval.decided_at.is_(None),
            Approval.expires_at <= now,
        )
    ).scalars().all()

    voided = 0
    for appr in rows:
        order = db.get(Order, appr.order_id)
        if order is None or order.status != "pending_approval":
            continue
        try:
            if order.authorization_id:
                paypal.void(order.authorization_id, request_id=order.id + "-expire")
            order.decision = "void"
            set_status(order, "voided", [])
            appr.decision = "decline"
            appr.decided_at = now
            db.commit()
            log.info("expire_approvals.voided order_id=%s", order.id)
            build_proof_step(db, order.id)
            voided += 1
        except Exception:
            log.exception("expire_approvals.error order_id=%s", order.id)
            db.rollback()
    return voided


def run_once(_db=None) -> int:
    """Void all expired pending_approval orders. Returns the number voided.

    If ``_db`` is provided the caller owns the session lifecycle (useful for
    tests).  Otherwise a fresh session is created and closed here.
    """
    own_session = _db is None
    if own_session:
        from app.db import new_session
        _db = new_session()
    try:
        return _expire_batch(_db)
    finally:
        if own_session:
            _db.close()


async def run_loop(interval_s: int = 60) -> None:
    """Async loop that calls run_once every interval_s seconds."""
    while True:
        try:
            n = run_once()
            if n:
                log.info("expire_approvals.batch voided=%d", n)
        except Exception:
            log.exception("expire_approvals.loop_error")
        await asyncio.sleep(interval_s)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    n = run_once()
    print(f"expire_approvals: voided {n} order(s)")
    sys.exit(0)
