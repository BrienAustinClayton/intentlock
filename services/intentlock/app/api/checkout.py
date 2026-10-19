"""Checkout router: POST /checkout (signed agent request -> pipeline)."""
import asyncio
import json
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crypto.vector import VECTOR_PUBLIC_KEY
from app.db import get_db
from app.deps import require_agent
from app.ids import new_id
from app.mandates import CENT, format_amount
from app.models import Agent, Intent, Order
from app.pipeline.runner import run_checkout
from app.pipeline.steps import record_check
from app.product_truth import CartNotVerified, domain_of, verify_cart
from app.velocity import check_agent_order_rate

MONEY_RE = r"^\d{1,9}(\.\d{1,2})?$"
MAX_TOTAL = Decimal("9999999999.99")


class CartItemIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    product_id: str = Field(min_length=1, max_length=128)
    title: str = Field(default="", max_length=300)
    variant: str | None = Field(default=None, max_length=128)
    qty: int = Field(ge=1, le=1000)
    unit_price: str = Field(pattern=MONEY_RE)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    category: str = Field(min_length=1, max_length=64)
    url: str | None = Field(default=None, max_length=2048)


class CheckoutBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    intent_id: str = Field(min_length=1, max_length=64)
    merchant: str = Field(min_length=1, max_length=64)
    cart: list[CartItemIn] = Field(default_factory=list, max_length=50)
    page_urls: list[Annotated[str, Field(max_length=2048)]] = Field(default_factory=list, max_length=10)
    shipping_address: str | dict[str, Any] | None = None
    trace_id: str | None = Field(default=None, max_length=128)

    @model_validator(mode="before")
    @classmethod
    def _no_nul(cls, data):
        # Postgres JSONB rejects \u0000; refuse it up front (422) instead of a 500 at flush.
        stack = [data]
        while stack:
            v = stack.pop()
            if isinstance(v, str) and "\x00" in v:
                raise ValueError("NUL character not allowed")
            if isinstance(v, dict):
                stack.extend(v.keys())
                stack.extend(v.values())
            elif isinstance(v, list):
                stack.extend(v)
        return data

    @model_validator(mode="after")
    def _addr_size(self):
        if self.shipping_address is not None and len(json.dumps(self.shipping_address, default=str)) > 2000:
            raise ValueError("shipping_address too large")
        return self


@dataclass
class VerifiedAgent:
    agent: Agent
    duration_ms: int


async def verified_agent(request: Request, db: Session = Depends(get_db)) -> VerifiedAgent:
    t0 = time.perf_counter()
    agent = await require_agent(request, db)  # raises 401 HTTPException
    if agent.public_key == VECTOR_PUBLIC_KEY:
        # Lab agents sign with the published RFC 9421 test key: only the lab may use them.
        raise HTTPException(status_code=403, detail={"error": "lab_agent", "reason": "lab agents can't check out"})
    return VerifiedAgent(agent, max(0, int((time.perf_counter() - t0) * 1000)))


def _err(status: int, error: str, reason: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": error, "reason": reason})


def build_order(body: CheckoutBody, intent: Intent, agent: Agent) -> Order:
    """Build the received Order row for a validated checkout body (shared with /lab)."""
    lines = []
    total = Decimal("0.00")
    for it in body.cart:
        price = Decimal(it.unit_price).quantize(CENT)
        total += price * it.qty
        lines.append({**it.model_dump(), "unit_price": format_amount(price)})
    total = total.quantize(CENT)
    if total > MAX_TOTAL:
        raise _err(422, "unprocessable", "cart total too large")
    return Order(
        id=new_id("ord"), intent_id=intent.id, agent_id=agent.id, user_id=intent.user_id,
        merchant=body.merchant.strip(), cart_json=lines, total=total,
        currency=(body.cart[0].currency if body.cart else "USD"), status="received",
        page_urls=list(body.page_urls), shipping_address=body.shipping_address, trace_id=body.trace_id,
    )


router = APIRouter(tags=["checkout"])

RETRY_AFTER = ("failed",)  # only a technical failure frees the request for another checkout


def approved_cart_problem(approved: list[dict], store: str, lines: list[dict]) -> str | None:
    """Why this checkout isn't exactly the cart the user approved (None when it is).
    Same store, same products, same quantities; a price may only have gone down."""
    want = {a["product_id"]: a for a in approved if isinstance(a, dict) and a.get("product_id")}
    if {domain_of(a.get("merchant")) for a in want.values()} != {store}:
        return f"You approved a cart from a different store, not {store}."
    got = {l["product_id"]: l for l in lines}
    if set(got) != set(want):
        return "The agent's cart has different products from the cart you approved."
    for pid, a in want.items():
        line = got[pid]
        if int(line["qty"]) != int(a["qty"]):
            return f"You approved {a['qty']} × {str(line.get('title'))[:60]}, not {line['qty']}."
        if Decimal(line["unit_price"]) > Decimal(str(a["unit_price"])):
            return (f"{str(line.get('title'))[:60]} now costs ${line['unit_price']}, more than the "
                    f"${a['unit_price']} you approved.")
    return None


@router.post("/checkout")
async def checkout(request: Request, verified: VerifiedAgent = Depends(verified_agent),
                   db: Session = Depends(get_db)):
    agent = verified.agent
    raw = await request.body()
    try:
        body = CheckoutBody.model_validate(json.loads(raw))
    except (ValueError, ValidationError):
        raise _err(422, "unprocessable", "invalid checkout body")
    # Lock the intent row: one live order per purchase request, even with concurrent checkouts.
    intent = db.execute(select(Intent).where(Intent.id == body.intent_id).with_for_update()).scalar_one_or_none()
    if intent is None:
        raise _err(404, "not_found", "intent not found")
    if intent.agent_id != agent.id or intent.user_id != agent.user_id:
        raise _err(403, "intent_mismatch", "intent does not belong to this agent")
    used = db.execute(select(Order.id).where(Order.intent_id == intent.id,
                                             Order.status.notin_(RETRY_AFTER)).limit(1)).first()
    if used is not None:
        raise _err(409, "intent_used", "this purchase request already has an order")
    check_agent_order_rate(db, agent.id)
    # Server-side truth: price, store, category and pages come from Channel3, not from the agent.
    try:
        store, lines, pages = await asyncio.to_thread(verify_cart, body.merchant,
                                                      [it.model_dump() for it in body.cart])
    except CartNotVerified as e:
        raise _err(409, "cart_not_verified", " ".join(e.reasons)[:500])
    if intent.approved_cart:
        problem = approved_cart_problem(intent.approved_cart, store, lines)
        if problem:
            raise _err(409, "not_what_you_approved", problem)
    body = body.model_copy(update={"merchant": store, "cart": [CartItemIn(**l) for l in lines],
                                   # scan Channel3's pages plus any the agent saw (scanning more is safer)
                                   "page_urls": list(dict.fromkeys(pages + list(body.page_urls)))[:10]})
    order = build_order(body, intent, agent)
    db.add(order)
    db.flush()
    record_check(db, order.id, "verify_agent", "pass",
                 {"result": "pass", "reason": "ok", "keyid": agent.id}, verified.duration_ms)
    db.commit()
    outcome = await run_checkout(db, order.id, allow_fixtures=False)
    return outcome.to_response()
