"""Plain-data pipeline context (no ORM objects, JSON-serialisable)."""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field, fields
from typing import Any

from app.mandates import format_amount
from app.signing import iso_z


@dataclass(frozen=True)
class PipelineContext:
    order_id: str
    user_id: str
    agent_id: str
    merchant: str
    currency: str
    total: str
    cart: list
    page_urls: list
    shipping_address: Any
    request_text: str
    mandate: dict | None
    device_id: str
    public_key: str
    created_at: str
    allow_fixtures: bool = False

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "PipelineContext":
        return cls(**{f.name: d[f.name] for f in fields(cls) if f.name in d})


@dataclass(frozen=True)
class OrderSnapshot:
    id: str
    order_id: str
    user_id: str
    agent_id: str
    merchant: str
    total: str
    currency: str
    created_at: str
    device_id: str
    public_key: str
    cart: list

    def __getitem__(self, k: str) -> Any:
        try:
            return getattr(self, k)
        except AttributeError:
            raise KeyError(k) from None

    def get(self, k: str, default=None) -> Any:
        return getattr(self, k, default)

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)

    @classmethod
    def from_ctx(cls, ctx: PipelineContext) -> "OrderSnapshot":
        return cls(
            id=ctx.order_id, order_id=ctx.order_id, user_id=ctx.user_id, agent_id=ctx.agent_id,
            merchant=ctx.merchant, total=ctx.total, currency=ctx.currency, created_at=ctx.created_at,
            device_id=ctx.device_id, public_key=ctx.public_key, cart=ctx.cart,
        )


@dataclass
class StepRun:
    output: dict
    duration_ms: int
    attempts: int = 1


@dataclass
class CheckoutOutcome:
    order_id: str
    status: str
    decision: str | None
    reasons: list
    status_history: list = field(default_factory=list)
    already_processed: bool = False

    def to_response(self) -> dict:
        return {
            "order_id": self.order_id,
            "status": self.status,
            "decision": self.decision,
            "reasons": list(self.reasons),
        }


def build_context(db, order, intent, mandate, agent, *, allow_fixtures: bool) -> PipelineContext:
    return PipelineContext(
        order_id=order.id,
        user_id=order.user_id,
        agent_id=order.agent_id,
        merchant=order.merchant,
        currency=order.currency,
        total=format_amount(order.total),
        cart=list(order.cart_json or []),
        page_urls=[u for u in (order.page_urls or []) if isinstance(u, str)],
        shipping_address=order.shipping_address,
        request_text=intent.request_text,
        mandate=dict(mandate.signed_json) if mandate is not None else None,
        device_id=agent.device_id,
        public_key=agent.public_key,
        created_at=iso_z(order.created_at),
        allow_fixtures=bool(allow_fixtures),
    )


def outcome_from_order(order, history=None, *, already: bool = False) -> CheckoutOutcome:
    return CheckoutOutcome(
        order.id, order.status, order.decision, list(order.reasons or []), list(history or []), already
    )
