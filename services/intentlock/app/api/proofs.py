"""Proofs router: GET /orders/{order_id}/proof, POST /proofs/verify."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Order
from app.proof import latest_proof
from app.proof.sign import proof_public_key_b64, verify_bundle

router = APIRouter(tags=["proofs"])


class VerifyBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    bundle: Any
    signature: str


@router.get("/orders/{order_id}/proof")
def get_proof(order_id: str, db: Session = Depends(get_db)) -> dict:
    if db.get(Order, order_id) is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "reason": "order not found"})
    proof = latest_proof(db, order_id)
    if proof is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "reason": "proof not issued yet"})
    valid, _ = verify_bundle(proof.bundle_json, proof.signature)
    return {
        "bundle": proof.bundle_json,
        "sha256": proof.sha256,
        "signature": proof.signature,
        "public_key": proof_public_key_b64(),
        "valid": valid,
    }


@router.post("/proofs/verify")
def verify_proof(body: VerifyBody) -> dict:
    valid, sha = verify_bundle(body.bundle, body.signature)
    return {"valid": valid, "sha256": sha}
