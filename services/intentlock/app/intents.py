"""Signed intents. The payload is {id,user_id,agent_id,request_text,signed_at}, plus cart_sha256 when the
user approved an exact cart (chat checkout): then checkout must match that cart.

Nothing but the signature is stored beyond the row columns, because the payload
is rebuilt from the row. No code path modifies an intent after creation.
"""
from __future__ import annotations

import hashlib
from datetime import datetime

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from sqlalchemy.orm import Session

from app.ids import new_id
from app.models import Agent, Intent, User
from app.service_errors import ServiceError
from app.signing import canonical_json, iso_z, sign_payload, utc_seconds, utcnow, verify_payload

INTENT_TEXT_MAX = 2000


def cart_sha256(approved_cart: list[dict] | None) -> str | None:
    return hashlib.sha256(canonical_json(approved_cart)).hexdigest() if approved_cart else None


def build_intent_payload(
    *, intent_id: str, user_id: str, agent_id: str, request_text: str, signed_at: str,
    approved_cart: list[dict] | None = None,
) -> dict:
    payload = {
        "id": intent_id,
        "user_id": user_id,
        "agent_id": agent_id,
        "request_text": request_text,
        "signed_at": signed_at,
    }
    if approved_cart:
        payload["cart_sha256"] = cart_sha256(approved_cart)
    return payload


def intent_payload_from_row(intent: Intent) -> dict:
    return build_intent_payload(
        intent_id=intent.id,
        user_id=intent.user_id,
        agent_id=intent.agent_id,
        request_text=intent.request_text,
        signed_at=iso_z(intent.signed_at),
        approved_cart=intent.approved_cart,
    )


def _validate_text(text: object) -> str:
    if not isinstance(text, str):
        raise ServiceError(422, "invalid_request_text", "request_text must be a string")
    t = text.strip()
    if "\x00" in t or len(t) == 0 or len(t) > INTENT_TEXT_MAX:
        raise ServiceError(422, "invalid_request_text", "request_text must be 1-2000 characters")
    return t


def new_signed_intent(
    *,
    user_id: str,
    agent_id: str,
    request_text: str,
    now: datetime | None = None,
    private_key: Ed25519PrivateKey | None = None,
    approved_cart: list[dict] | None = None,
) -> Intent:
    """Build a signed Intent that is NOT added to any session."""
    signed_at = utc_seconds(now or utcnow())
    intent_id = new_id("int")
    payload = build_intent_payload(
        intent_id=intent_id,
        user_id=user_id,
        agent_id=agent_id,
        request_text=request_text,
        signed_at=iso_z(signed_at),
        approved_cart=approved_cart,
    )
    return Intent(
        id=intent_id,
        user_id=user_id,
        agent_id=agent_id,
        request_text=request_text,
        signed_at=signed_at,
        signature=sign_payload(payload, private_key),
        approved_cart=approved_cart or None,
    )


def create_intent(
    db: Session, *, user_id: str, agent_id: str, request_text: str, now: datetime | None = None,
    approved_cart: list[dict] | None = None,
) -> Intent:
    user = db.get(User, user_id)
    if user is None:
        raise ServiceError(404, "not_found", "user not found")
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise ServiceError(404, "not_found", "agent not found")
    if agent.user_id != user_id:
        raise ServiceError(403, "agent_user_mismatch", "agent does not belong to user")
    if agent.revoked_at is not None:
        raise ServiceError(409, "agent_revoked", "agent is revoked")
    text = _validate_text(request_text)
    intent = new_signed_intent(user_id=user_id, agent_id=agent_id, request_text=text, now=now,
                               approved_cart=approved_cart)
    db.add(intent)
    db.commit()
    db.refresh(intent)
    return intent


def verify_intent_signature(intent: Intent, public_key: Ed25519PublicKey | None = None) -> bool:
    try:
        return verify_payload(intent_payload_from_row(intent), intent.signature, public_key)
    except (TypeError, ValueError, AttributeError):
        return False


def intent_to_dict(intent: Intent) -> dict:
    return {
        "id": intent.id,
        "user_id": intent.user_id,
        "agent_id": intent.agent_id,
        "request_text": intent.request_text,
        "signed_at": iso_z(intent.signed_at),
        "signature": intent.signature,
        "approved_cart": intent.approved_cart,
    }
