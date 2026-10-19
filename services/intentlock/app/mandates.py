"""Signed mandates (AP2-style) and the pure ``check_mandate`` function.

``signed_json`` shape (money is a 2-decimal string, times are ISO-8601 UTC
seconds, ``expires_at`` and ``revoked_at`` may be null)::

    {
      "type": "intentlock.mandate.v1",
      "id": "mdt_01J...",
      "agent_id": "agt_...",
      "user_id": "usr_...",
      "constraints": {
        "categories": ["electronics_accessories", "groceries"],
        "merchants": ["freshmart"],
        "budget": {"amount": "50.00", "currency": "USD", "period": "week"},
        "valid": {"starts_at": "2026-10-16T00:00:00Z", "expires_at": "2026-11-16T00:00:00Z"}
      },
      "revoked_at": null,
      "issued_at": "2026-10-16T09:30:12Z"
    }

AP2 mapping (https://ap2-protocol.org/ap2/payment_mandate/, Open Payment
Mandate, ``vct: mandate.payment.open.1``, ``constraints[]``):

| IntentLock ``signed_json``              | AP2 Open Payment Mandate                              |
|-----------------------------------------|-------------------------------------------------------|
| ``type: "intentlock.mandate.v1"``       | ``vct``                                               |
| ``constraints.budget {amount,currency}``| constraint ``payment.budget {max,currency}``          |
| ``constraints.budget.period``           | constraint ``payment.agent_recurrence.frequency``     |
| ``constraints.merchants``               | constraint ``payment.allowed_payees``                 |
| ``constraints.valid {starts_at,...}``   | ``payment.execution_date {not_before,not_after}``/exp |
| ``constraints.categories``              | IntentLock extension (AP2 Checkout Mandate goals)     |
| ``issued_at``                           | ``iat``                                               |
| ``signature`` (Ed25519, wallet key)     | issuer signature                                      |

P1-T08 usage::

    draft = OrderDraft.from_checkout(agent.id, body)
    mandate = select_mandate_for_agent(db, agent.id, draft.merchant)
    spent = spent_in_period(db, mandate, exclude_order_id=order.id) if mandate else Decimal("0")
    res = check_mandate(draft, mandate, spent, intent=intent)
    details_json = res.as_check_output()   # also the `mandate` arg to app.policy.decide()
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Iterable, Literal

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ids import new_id
from app.intents import verify_intent_signature
from app.models import Agent, Intent, Mandate, Order
from app.service_errors import ServiceError
from app.signing import (
    iso_z,
    parse_iso_z,
    sign_payload,
    to_utc,
    utc_seconds,
    utcnow,
    verify_payload,
)

MANDATE_TYPE = "intentlock.mandate.v1"
BUDGET_PERIODS = ("week", "month", "once")
SPEND_STATUSES = ("awaiting_payment", "authorized", "checking", "pending_approval", "captured")
SLUG_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
# Stores are Channel3 merchant domains (walmart.com), legacy demo slugs (freshmart), or "*" for any store.
MERCHANT_RE = re.compile(r"^(\*|[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?)$")
ANY_MERCHANT = "*"


def normalize_merchant(value: str) -> str:
    s = value.strip().lower()
    return s[4:] if s.startswith("www.") else s


def merchant_allowed(merchant: str, allowed: Iterable[str]) -> bool:
    allowed = set(allowed or [])
    return ANY_MERCHANT in allowed or normalize_merchant(merchant) in allowed
CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
CENT = Decimal("0.01")


# --------------------------------------------------------------------------- #
# Normalisation helpers
# --------------------------------------------------------------------------- #
def format_amount(value: Decimal | int | str) -> str:
    return str(Decimal(str(value)).quantize(CENT))


def normalize_slugs(values: Iterable[str], field: str) -> list[str]:
    out: set[str] = set()
    if isinstance(values, (str, bytes)):
        raise ServiceError(422, "invalid_field", f"{field} must be a list of slugs")
    for v in values:
        if not isinstance(v, str):
            raise ServiceError(422, "invalid_field", f"{field} entries must be strings")
        s = normalize_merchant(v) if field == "merchants" else v.strip().lower()
        if not (MERCHANT_RE if field == "merchants" else SLUG_RE).match(s):
            raise ServiceError(422, "invalid_field", f"{field} contains an invalid slug")
        out.add(s)
    if not out:
        raise ServiceError(422, "invalid_field", f"{field} must have at least one entry")
    return sorted(out)


# --------------------------------------------------------------------------- #
# Payload / signature
# --------------------------------------------------------------------------- #
def build_mandate_payload(mandate: Mandate, *, user_id: str, issued_at: str) -> dict:
    return {
        "type": MANDATE_TYPE,
        "id": mandate.id,
        "agent_id": mandate.agent_id,
        "user_id": user_id,
        "constraints": {
            "categories": sorted(set(mandate.categories or [])),
            "merchants": sorted(set(mandate.merchants or [])),
            "budget": {
                "amount": format_amount(mandate.budget_amount),
                "currency": mandate.currency,
                "period": mandate.budget_period,
            },
            "valid": {
                "starts_at": iso_z(mandate.starts_at),
                "expires_at": iso_z(mandate.expires_at) if mandate.expires_at is not None else None,
            },
        },
        "revoked_at": iso_z(mandate.revoked_at) if mandate.revoked_at is not None else None,
        "issued_at": issued_at,
    }


def sign_mandate(
    mandate: Mandate,
    *,
    user_id: str,
    now: datetime | None = None,
    private_key: Ed25519PrivateKey | None = None,
) -> None:
    payload = build_mandate_payload(mandate, user_id=user_id, issued_at=iso_z(now or utcnow()))
    mandate.signed_json = payload
    mandate.signature = sign_payload(payload, private_key)


def verify_mandate_signature(
    mandate: Mandate, public_key: Ed25519PublicKey | None = None
) -> bool:
    if not isinstance(mandate.signed_json, dict) or not isinstance(mandate.signature, str):
        return False
    return verify_payload(mandate.signed_json, mandate.signature, public_key)


def mandate_row_matches(mandate: Mandate) -> bool:
    try:
        p = mandate.signed_json
        expected = build_mandate_payload(
            mandate, user_id=p.get("user_id"), issued_at=p.get("issued_at")
        )
        return expected == p
    except (KeyError, TypeError, ValueError, AttributeError, ArithmeticError):
        return False


# --------------------------------------------------------------------------- #
# Services
# --------------------------------------------------------------------------- #
def _check_window(mandate: Mandate) -> None:
    if mandate.expires_at is not None and mandate.expires_at <= mandate.starts_at:
        raise ServiceError(422, "invalid_window", "expires_at must be after starts_at")


def _apply_fields(mandate: Mandate, fields: dict) -> None:
    for key, value in fields.items():
        if key in ("categories", "merchants"):
            if value is None:
                raise ServiceError(422, "invalid_field", f"{key} cannot be null")
            setattr(mandate, key, normalize_slugs(value, key))
        elif key == "budget_amount":
            if value is None:
                raise ServiceError(422, "invalid_field", "budget_amount cannot be null")
            try:
                amount = Decimal(str(value))
            except ArithmeticError:
                raise ServiceError(422, "invalid_field", "budget_amount is not a number")
            if not amount.is_finite() or amount <= 0 or amount != amount.quantize(CENT):
                raise ServiceError(422, "invalid_field", "budget_amount must be > 0 with 2 decimals")
            mandate.budget_amount = amount.quantize(CENT)
        elif key == "budget_period":
            if value not in BUDGET_PERIODS:
                raise ServiceError(422, "invalid_field", "budget_period must be week, month or once")
            mandate.budget_period = value
        elif key == "currency":
            if not isinstance(value, str) or not CURRENCY_RE.match(value):
                raise ServiceError(422, "invalid_field", "currency must be a 3-letter uppercase code")
            mandate.currency = value
        elif key == "starts_at":
            if value is None:
                raise ServiceError(422, "invalid_field", "starts_at cannot be null")
            mandate.starts_at = utc_seconds(value)
        elif key == "expires_at":
            mandate.expires_at = utc_seconds(value) if value is not None else None
        elif value is None:
            raise ServiceError(422, "invalid_field", f"{key} cannot be null")


def _get_agent(db: Session, agent_id: str) -> Agent:
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise ServiceError(404, "not_found", "agent not found")
    return agent


def create_mandate(db: Session, data: dict, now: datetime | None = None) -> Mandate:
    now = now or utcnow()
    agent = _get_agent(db, data["agent_id"])
    if agent.revoked_at is not None:
        raise ServiceError(409, "agent_revoked", "agent is revoked")
    m = Mandate(id=new_id("mdt"), agent_id=agent.id, revoked_at=None)
    fields = {
        k: data.get(k)
        for k in ("categories", "merchants", "budget_amount", "budget_period", "currency", "expires_at")
    }
    fields["starts_at"] = data.get("starts_at") or now
    _apply_fields(m, fields)
    _check_window(m)
    sign_mandate(m, user_id=agent.user_id, now=now)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def update_mandate(
    db: Session, mandate_id: str, changes: dict, now: datetime | None = None
) -> Mandate:
    m = db.get(Mandate, mandate_id)
    if m is None:
        raise ServiceError(404, "not_found", "mandate not found")
    if m.revoked_at is not None:
        raise ServiceError(409, "mandate_revoked", "revoked mandates cannot be changed")
    changes = dict(changes)
    agent_id = changes.pop("agent_id", None)
    if agent_id is not None and agent_id != m.agent_id:
        raise ServiceError(422, "agent_id_immutable", "agent_id cannot be changed")
    _apply_fields(m, changes)
    _check_window(m)
    agent = _get_agent(db, m.agent_id)
    sign_mandate(m, user_id=agent.user_id, now=now)
    db.commit()
    db.refresh(m)
    return m


def revoke_mandate(db: Session, mandate_id: str, now: datetime | None = None) -> Mandate:
    m = db.get(Mandate, mandate_id)
    if m is None:
        raise ServiceError(404, "not_found", "mandate not found")
    if m.revoked_at is not None:
        return m
    now = now or utcnow()
    m.revoked_at = utc_seconds(now)
    agent = _get_agent(db, m.agent_id)
    sign_mandate(m, user_id=agent.user_id, now=now)
    db.commit()
    db.refresh(m)
    return m


def list_mandates_for_user(db: Session, user_id: str) -> list[Mandate]:
    stmt = (
        select(Mandate)
        .join(Agent, Agent.id == Mandate.agent_id)
        .where(Agent.user_id == user_id)
        .order_by(Mandate.starts_at.desc(), Mandate.id.desc())
    )
    return list(db.execute(stmt).scalars().all())


def mandate_to_dict(m: Mandate) -> dict:
    return {
        "id": m.id,
        "agent_id": m.agent_id,
        "user_id": (m.signed_json or {}).get("user_id"),
        "categories": list(m.categories or []),
        "merchants": list(m.merchants or []),
        "budget_amount": format_amount(m.budget_amount),
        "budget_period": m.budget_period,
        "currency": m.currency,
        "starts_at": iso_z(m.starts_at),
        "expires_at": iso_z(m.expires_at) if m.expires_at is not None else None,
        "revoked_at": iso_z(m.revoked_at) if m.revoked_at is not None else None,
        "signed_json": m.signed_json,
        "signature": m.signature,
    }


# --------------------------------------------------------------------------- #
# Order draft + check result
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class CartLine:
    product_id: str
    title: str
    variant: str | None
    qty: int
    unit_price: Decimal
    currency: str
    category: str
    url: str | None

    @property
    def line_total(self) -> Decimal:
        return (self.unit_price * self.qty).quantize(CENT)


@dataclass(frozen=True)
class OrderDraft:
    agent_id: str
    intent_id: str
    merchant: str
    cart: tuple[CartLine, ...]

    @property
    def total(self) -> Decimal:
        return sum((l.line_total for l in self.cart), Decimal("0.00")).quantize(CENT)

    @classmethod
    def from_checkout(cls, agent_id: str, body: dict) -> "OrderDraft":
        try:
            lines = tuple(
                CartLine(
                    product_id=str(l["product_id"]),
                    title=str(l.get("title", "")),
                    variant=(None if l.get("variant") is None else str(l["variant"])),
                    qty=int(l["qty"]),
                    unit_price=Decimal(str(l["unit_price"])),
                    currency=str(l["currency"]),
                    category=str(l["category"]),
                    url=(None if l.get("url") is None else str(l["url"])),
                )
                for l in body["cart"]
            )
            return cls(
                agent_id=agent_id,
                intent_id=str(body["intent_id"]),
                merchant=str(body["merchant"]),
                cart=lines,
            )
        except (KeyError, TypeError, ValueError, ArithmeticError, AttributeError) as exc:
            raise ValueError("invalid_cart") from exc


@dataclass(frozen=True)
class CheckResult:
    result: Literal["pass", "fail"]
    reason: str
    reasons: tuple[str, ...]
    message: str
    details: dict

    @property
    def passed(self) -> bool:
        return self.result == "pass"

    def as_check_output(self) -> dict:
        # CONTRACTS: {"result": "pass|fail", "reason": "<code>", "message": "<sentence>"}
        return {
            "result": self.result,
            "reason": self.reason,
            "message": self.message,
            "reason_codes": list(self.reasons),
            **self.details,
        }


MESSAGE_MAX = 160
_ECHO_MAX = 40


def _echo(value: str) -> str:
    """Agent-supplied text is echoed only when it is a short slug; otherwise left out."""
    v = value.strip().lower() if isinstance(value, str) else ""
    if len(v) <= _ECHO_MAX and SLUG_RE.match(v):
        return v
    return ""


def _cap(msg: str) -> str:
    return msg if len(msg) <= MESSAGE_MAX else msg[: MESSAGE_MAX - 3] + "..."


_MSG = {
    "no_mandate": "No mandate exists for this agent",
    "mandate_signature_invalid": "Mandate signature is invalid",
    "mandate_row_mismatch": "Mandate record does not match its signed copy",
    "intent_signature_invalid": "Signed request is invalid",
    "intent_mismatch": "Order does not belong to this signed request",
    "agent_mismatch": "Agent is not covered by this mandate",
    "mandate_revoked": "Mandate was revoked",
    "invalid_cart": "Cart is empty or has invalid lines",
}


def check_mandate(
    order_draft: OrderDraft,
    mandate: Mandate | None,
    spent_in_period: Decimal,
    *,
    intent: Intent,
    now: datetime | None = None,
    public_key: Ed25519PublicKey | None = None,
) -> CheckResult:
    """Pure mandate check: no DB access, no network, no relationship loads."""
    now = to_utc(now or utcnow())
    base = {"mandate_id": getattr(mandate, "id", None), "checked_at": iso_z(now)}

    def fail(failures: list[tuple[str, str]], extra: dict | None = None) -> CheckResult:
        failures = [(c, _cap(m)) for c, m in failures]
        d = {**base, **(extra or {}), "failures": [{"code": c, "message": m} for c, m in failures]}
        return CheckResult("fail", failures[0][0], tuple(c for c, _ in failures), failures[0][1], d)

    def simple(code: str) -> CheckResult:
        return fail([(code, _MSG[code])])

    # Phase 1: integrity (stop at the first failure)
    if mandate is None:
        return simple("no_mandate")
    if not verify_mandate_signature(mandate, public_key):
        return simple("mandate_signature_invalid")
    if not mandate_row_matches(mandate):
        return simple("mandate_row_mismatch")
    if not verify_intent_signature(intent, public_key):
        return simple("intent_signature_invalid")
    p = mandate.signed_json
    try:
        if (
            order_draft.intent_id != intent.id
            or intent.agent_id != order_draft.agent_id
            or intent.user_id != p["user_id"]
        ):
            return simple("intent_mismatch")
        if order_draft.agent_id != p["agent_id"]:
            return simple("agent_mismatch")
    except (KeyError, TypeError):
        return simple("mandate_row_mismatch")

    try:
        c = p["constraints"]
        budget = c["budget"]
        currency = budget["currency"]
        valid = c["valid"]
        failures: list[tuple[str, str]] = []

        # Phase 2: status (collect all)
        if p["revoked_at"] is not None:
            failures.append(("mandate_revoked", _MSG["mandate_revoked"]))
        starts = parse_iso_z(valid["starts_at"])
        expires = parse_iso_z(valid["expires_at"]) if valid["expires_at"] else None
        if now < starts:
            failures.append(("mandate_not_started", f"Mandate starts at {valid['starts_at']}"))
        if expires is not None and now >= expires:
            failures.append(("mandate_expired", f"Mandate expired at {valid['expires_at']}"))

        # Phase 3: cart (collect all)
        total = order_draft.total
        spent = max(Decimal(str(spent_in_period)), Decimal("0")).quantize(CENT)
        remaining = (Decimal(budget["amount"]) - spent).quantize(CENT)
        merchant = normalize_merchant(order_draft.merchant)
        if not merchant_allowed(merchant, c["merchants"]):
            em = _echo(merchant)
            failures.append((
                "merchant_not_allowed",
                f"Merchant '{em}' is not allowed by the mandate" if em
                else "Merchant is not allowed by this mandate",
            ))
        bad: list[str] = []
        cart_ok = len(order_draft.cart) > 0 and all(
            l.qty >= 1 and l.unit_price >= 0 for l in order_draft.cart
        )
        if not cart_ok:
            failures.append(("invalid_cart", _MSG["invalid_cart"]))
        else:
            currency_ok = all(l.currency == currency for l in order_draft.cart)
            if not currency_ok:
                failures.append(
                    ("currency_mismatch", f"Cart currency does not match mandate currency {currency}")
                )
            bad = sorted({l.category.strip().lower() for l in order_draft.cart} - set(c["categories"]))
            if bad:
                ec = _echo(bad[0])
                failures.append((
                    "category_not_allowed",
                    f"Category '{ec}' is not allowed by the mandate" if ec
                    else "A cart category is not allowed by this mandate",
                ))
            if currency_ok and total > remaining:
                failures.append(
                    (
                        "over_budget",
                        f"Total {format_amount(total)} {currency} exceeds remaining budget "
                        f"{format_amount(remaining)} {currency}",
                    )
                )
        extra = {
            "total": format_amount(total),
            "currency": currency,
            "spent_in_period": format_amount(spent),
            "remaining": format_amount(remaining),
            "budget_period": budget["period"],
        }
        if failures:
            safe_bad = [e for e in (_echo(b) for b in bad) if e][:10]
            if safe_bad:
                extra["disallowed_categories"] = safe_bad
            return fail(failures, extra)
        return CheckResult("pass", "ok", (), "Within mandate", {**base, **extra, "failures": []})
    except (KeyError, TypeError, ValueError, ArithmeticError, AttributeError):
        return simple("mandate_row_mismatch")


# --------------------------------------------------------------------------- #
# Spend window + selection
# --------------------------------------------------------------------------- #
def period_start(mandate: Mandate, now: datetime) -> datetime:
    now = to_utc(now)
    starts = to_utc(mandate.starts_at)
    if mandate.budget_period == "week":
        s = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    elif mandate.budget_period == "month":
        s = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:  # "once"
        s = starts
    return max(s, starts)


def spent_in_period(
    db: Session,
    mandate: Mandate,
    now: datetime | None = None,
    exclude_order_id: str | None = None,
) -> Decimal:
    """Money held for the mandate's agent inside the current budget window.

    Known limit: concurrency is out of scope. Two simultaneous orders can both
    pass the budget check because no locking is done here.
    """
    now = to_utc(now or utcnow())
    stmt = select(func.coalesce(func.sum(Order.total), 0)).where(
        Order.agent_id == mandate.agent_id,
        Order.currency == mandate.currency,
        Order.status.in_(SPEND_STATUSES),
        Order.created_at >= period_start(mandate, now),
        Order.created_at <= now,
    )
    if exclude_order_id is not None:
        stmt = stmt.where(Order.id != exclude_order_id)
    return Decimal(str(db.execute(stmt).scalar_one())).quantize(CENT)


def _is_active(m: Mandate, now: datetime) -> bool:
    return (
        m.revoked_at is None
        and to_utc(m.starts_at) <= now
        and (m.expires_at is None or now < to_utc(m.expires_at))
    )


def select_mandate_for_agent(
    db: Session, agent_id: str, merchant: str | None = None, now: datetime | None = None
) -> Mandate | None:
    now = to_utc(now or utcnow())
    rows = list(
        db.execute(
            select(Mandate)
            .where(Mandate.agent_id == agent_id)
            .order_by(Mandate.starts_at.desc(), Mandate.id.desc())
        )
        .scalars()
        .all()
    )
    if not rows:
        return None
    active = [m for m in rows if _is_active(m, now)]
    if merchant is not None:
        for m in active:
            if normalize_merchant(merchant) in (m.merchants or []):
                return m
        for m in active:
            if merchant_allowed(merchant, m.merchants or []):
                return m
    if active:
        return active[0]
    return rows[0]
