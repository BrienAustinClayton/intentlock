"""Render Workflows entrypoint for the IntentLock check pipeline.

Start (Render Workflow service, root dir services/intentlock):
    render-workflows workflows.intentlock_checks:app
Local task server:
    render workflows dev -- uv run render-workflows workflows.intentlock_checks:app
Docs: https://render.com/docs/workflows-sdk-python , https://render.com/docs/workflows-defining
"""
import asyncio

from render import Retry, TaskContext, Workflows

from app.db import new_session
from app.models import Order
from app.paypal import service as paypal_service
from app.pipeline import adapters, limits
from app.pipeline.context import PipelineContext
from app.pipeline.core import run_pipeline, timed_ai_step

app = Workflows(default_timeout=limits.RENDER_TASK_TIMEOUT_S)
PAY_RETRY = Retry(max_retries=2, wait_duration_ms=500, backoff_scaling=2.0)
AI_RETRY = Retry(max_retries=1, wait_duration_ms=200, backoff_scaling=1.5)
ORCH_RETRY = Retry(max_retries=0, wait_duration_ms=1000, backoff_scaling=1.0)
T = limits.RENDER_TASK_TIMEOUT_S


def _load_order(db, order_id):
    order = db.get(Order, order_id)
    if order is None:
        raise ValueError("order_not_found")
    return order


@app.task(name="authorize_payment", retry=PAY_RETRY, timeout_seconds=T)
def authorize_payment(ctx: TaskContext, order_id: str) -> dict:
    db = new_session()
    try:
        pp, auth = paypal_service.authorize(_load_order(db, order_id))
        return {"paypal_order_id": pp, "authorization_id": auth}
    finally:
        db.close()


@app.task(name="capture_payment", retry=PAY_RETRY, timeout_seconds=T)
def capture_payment(ctx: TaskContext, order_id: str, authorization_id: str) -> dict:
    return {"capture_id": paypal_service.capture(authorization_id, request_id=f"{order_id}-capture")}


@app.task(name="void_payment", retry=PAY_RETRY, timeout_seconds=T)
def void_payment(ctx: TaskContext, order_id: str, authorization_id: str) -> dict:
    paypal_service.void(authorization_id, request_id=f"{order_id}-void")
    return {"voided": True}


@app.task(name="scan_injection", retry=AI_RETRY, timeout_seconds=T)
def scan_injection_task(ctx: TaskContext, pctx: dict) -> dict:
    return adapters.compute_scan_injection(PipelineContext.from_dict(pctx))


@app.task(name="intent_diff", retry=AI_RETRY, timeout_seconds=T)
def intent_diff_task(ctx: TaskContext, pctx: dict) -> dict:
    return adapters.compute_intent_diff(PipelineContext.from_dict(pctx))


@app.task(name="graph_risk", retry=AI_RETRY, timeout_seconds=T)
def graph_risk_task(ctx: TaskContext, pctx: dict) -> dict:
    return adapters.compute_graph_risk(PipelineContext.from_dict(pctx))


class RenderExecutor:
    mode = "render"

    def __init__(self, ctx: TaskContext):
        self.ctx = ctx

    async def authorize(self, order_id):
        r = await self.ctx.run(authorize_payment, order_id)
        return r["paypal_order_id"], r["authorization_id"]

    async def capture(self, order_id, authorization_id):
        r = await self.ctx.run(capture_payment, order_id, authorization_id)
        return r["capture_id"]

    async def void(self, order_id, authorization_id):
        await self.ctx.run(void_payment, order_id, authorization_id)

    async def run_ai(self, pctx):
        d = pctx.to_dict()
        tasks = {"scan_injection": scan_injection_task, "intent_diff": intent_diff_task,
                 "graph_risk": graph_risk_task}
        runs = await asyncio.gather(*(
            timed_ai_step(n, (lambda t=t: self.ctx.run(t, d)), retries=0) for n, t in tasks.items()))
        return dict(zip(tasks, runs))


@app.task(name="run_checkout", retry=ORCH_RETRY, timeout_seconds=120)
async def run_checkout_task(ctx: TaskContext, order_id: str, allow_fixtures: bool = False) -> dict:
    db = new_session()
    try:
        outcome = await run_pipeline(db, order_id, RenderExecutor(ctx), allow_fixtures=allow_fixtures)
        return outcome.to_response()
    finally:
        db.close()


if __name__ == "__main__":
    app.start()
