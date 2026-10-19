"""Local executor and run_checkout (local or Render mode)."""
from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.models import Order
from app.paypal import service as paypal_service
from app.pipeline import adapters, limits
from app.pipeline.context import CheckoutOutcome, outcome_from_order
from app.pipeline.core import run_pipeline, timed_ai_step

log = logging.getLogger("intentlock.pipeline")

AI_STEPS = ("scan_injection", "intent_diff", "graph_risk")


class RenderUnavailable(Exception):
    pass


async def _with_pay_retries(fn):
    attempts = limits.PAY_RETRIES + 1
    for i in range(attempts):
        try:
            return fn()
        except paypal_service.PayPalError as e:
            if not e.retryable or i == attempts - 1:
                raise
            await asyncio.sleep(limits.PAY_BACKOFF_S * (2 ** i))


class LocalExecutor:
    mode = "local"

    def __init__(self, db):
        self.db = db

    async def authorize(self, order_id):
        order = self.db.get(Order, order_id)
        return await _with_pay_retries(lambda: paypal_service.authorize(order))

    async def capture(self, order_id, authorization_id):
        return await _with_pay_retries(
            lambda: paypal_service.capture(authorization_id, request_id=f"{order_id}-capture"))

    async def void(self, order_id, authorization_id):
        await _with_pay_retries(
            lambda: paypal_service.void(authorization_id, request_id=f"{order_id}-void"))

    async def run_ai(self, ctx):
        fns = {"scan_injection": adapters.compute_scan_injection,
               "intent_diff": adapters.compute_intent_diff,
               "graph_risk": adapters.compute_graph_risk}
        runs = await asyncio.gather(*(
            timed_ai_step(n, (lambda f=fns[n]: asyncio.to_thread(f, ctx)), retries=limits.AI_RETRIES)
            for n in AI_STEPS))
        return dict(zip(AI_STEPS, runs))


async def run_checkout(db, order_id: str, mode: str | None = None, *,
                       allow_fixtures: bool = False) -> CheckoutOutcome:
    mode = mode if mode in ("local", "render") else limits.pipeline_mode()
    if mode == "render":
        try:
            return await _run_render(db, order_id, allow_fixtures)
        except RenderUnavailable as e:
            log.warning("pipeline.render_unavailable fallback=local reason=%s order_id=%s", e, order_id)
    return await run_pipeline(db, order_id, LocalExecutor(db), allow_fixtures=allow_fixtures)


def _render_client(token):
    try:
        from render import RenderAsync
    except ImportError:
        raise RenderUnavailable("sdk_missing") from None
    return RenderAsync(token=token)


_TERMINAL_RUN = {"completed", "succeeded", "failed", "canceled"}


async def _run_render(db, order_id, allow_fixtures):
    key, slug = settings.RENDER_API_KEY, settings.RENDER_WORKFLOW_SLUG
    if not key or not slug:
        raise RenderUnavailable("not_configured")
    client = _render_client(key)
    try:
        run = await asyncio.wait_for(
            client.workflows.start_task(f"{slug}/run_checkout", [order_id, bool(allow_fixtures)]),
            timeout=limits.RENDER_START_TIMEOUT_S)
    except Exception as e:
        raise RenderUnavailable(f"start_failed:{type(e).__name__}") from None

    async def _poll():
        while True:
            det = await client.workflows.get_task_run(run.id)
            st = str(getattr(det.status, "value", det.status)).lower()
            if st in _TERMINAL_RUN:
                return st
            await asyncio.sleep(limits.RENDER_POLL_S)

    try:
        await asyncio.wait_for(_poll(), timeout=limits.RENDER_WAIT_S)
        timed_out = False
    except TimeoutError:
        timed_out = True
    except Exception as e:
        log.warning("pipeline.render_poll_failed reason=%s", type(e).__name__)
        timed_out = True
    db.expire_all()
    order = db.get(Order, order_id)
    if order.status == "received":
        if timed_out:
            try:
                await client.workflows.cancel_task_run(run.id)
            except Exception:
                pass
        raise RenderUnavailable("timeout_not_started" if timed_out else "run_no_effect")
    return outcome_from_order(order)


async def resume_checkout(order_id: str) -> None:
    """Background task after the buyer approved the payment in PayPal: run the checks, then capture or void."""
    from app.db import new_session
    from app.pipeline.core import resume_after_payment

    db = new_session()
    try:
        await resume_after_payment(db, order_id, LocalExecutor(db))
    except Exception:
        log.exception("pipeline.resume_failed order_id=%s", order_id)
    finally:
        db.close()
