"""Proof of Intent: build, sign, store and verify."""
from __future__ import annotations

from sqlalchemy import select

from app.ids import new_id
from app.models import Proof
from app.proof.bundle import OrderNotFound, build_bundle
from app.proof.sign import (
    proof_public_key_b64,
    sha256_hex,
    sign_bundle,
    verify_bundle,
)

__all__ = [
    "issue_proof", "latest_proof", "build_bundle", "sign_bundle", "verify_bundle",
    "sha256_hex", "proof_public_key_b64", "OrderNotFound",
]


def issue_proof(db, order_id: str) -> str:
    """Build and sign the bundle for the order's current state and store it. Returns the proof id.

    The proofs table holds one row per order (unique order_id), so a re-issue after approval or
    timeout replaces the row in place: the latest proof wins. Caller commits.
    """
    bundle = build_bundle(db, order_id)
    signed = sign_bundle(bundle)
    row = db.execute(select(Proof).where(Proof.order_id == order_id)).scalar_one_or_none()
    if row is None:
        row = Proof(id=new_id("prf"), order_id=order_id)
        db.add(row)
    row.bundle_json = bundle
    row.sha256 = signed["sha256"]
    row.signature = signed["signature"]
    row.astropods_trace_id = bundle.get("astropods_trace_id")
    db.flush()
    return row.id


def latest_proof(db, order_id: str) -> Proof | None:
    return db.execute(
        select(Proof).where(Proof.order_id == order_id).order_by(Proof.created_at.desc(), Proof.id.desc()).limit(1)
    ).scalar_one_or_none()
