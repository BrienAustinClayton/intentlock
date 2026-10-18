"""Intents router: POST /intents, GET /intents/{id}. Intents are read-only after creation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.intents import create_intent, intent_to_dict
from app.models import Intent
from app.service_errors import ServiceError
from app.signing import iso_z

router = APIRouter(tags=["intents"])


class IntentCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: str = Field(min_length=1, max_length=64)
    agent_id: str = Field(min_length=1, max_length=64)
    request_text: str


@router.post("/intents", status_code=201)
def create_intent_route(body: IntentCreate, db: Session = Depends(get_db)) -> dict:
    try:
        i = create_intent(
            db, user_id=body.user_id, agent_id=body.agent_id, request_text=body.request_text
        )
    except ServiceError as e:
        raise HTTPException(
            status_code=e.status_code, detail={"error": e.error, "reason": e.reason}
        )
    return {"id": i.id, "signed_at": iso_z(i.signed_at), "signature": i.signature}


@router.get("/intents/{intent_id}")
def get_intent_route(intent_id: str, db: Session = Depends(get_db)) -> dict:
    i = db.get(Intent, intent_id)
    if i is None:
        raise HTTPException(
            status_code=404, detail={"error": "not_found", "reason": "intent not found"}
        )
    return intent_to_dict(i)
