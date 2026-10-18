"""Mandates router: POST/PATCH/GET /mandates, POST /mandates/{id}/revoke."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.mandates import (
    create_mandate,
    list_mandates_for_user,
    mandate_to_dict,
    revoke_mandate,
    update_mandate,
)
from app.service_errors import ServiceError

router = APIRouter(tags=["mandates"])


class MandateCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    agent_id: str = Field(min_length=1, max_length=64)
    categories: list[str] = Field(min_length=1, max_length=50)
    merchants: list[str] = Field(min_length=1, max_length=50)
    budget_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    budget_period: Literal["week", "month", "once"]
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class MandatePatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    agent_id: Optional[str] = None
    categories: Optional[list[str]] = Field(default=None, min_length=1, max_length=50)
    merchants: Optional[list[str]] = Field(default=None, min_length=1, max_length=50)
    budget_amount: Optional[Decimal] = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    budget_period: Optional[Literal["week", "month", "once"]] = None
    currency: Optional[str] = Field(default=None, pattern=r"^[A-Z]{3}$")
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


def _http(e: ServiceError) -> HTTPException:
    return HTTPException(status_code=e.status_code, detail={"error": e.error, "reason": e.reason})


@router.post("/mandates", status_code=201)
def create_mandate_route(body: MandateCreate, db: Session = Depends(get_db)) -> dict:
    try:
        return mandate_to_dict(create_mandate(db, body.model_dump()))
    except ServiceError as e:
        raise _http(e)


@router.patch("/mandates/{mandate_id}")
def update_mandate_route(
    mandate_id: str, body: MandatePatch, db: Session = Depends(get_db)
) -> dict:
    try:
        return mandate_to_dict(update_mandate(db, mandate_id, body.model_dump(exclude_unset=True)))
    except ServiceError as e:
        raise _http(e)


@router.post("/mandates/{mandate_id}/revoke")
def revoke_mandate_route(mandate_id: str, db: Session = Depends(get_db)) -> dict:
    try:
        return mandate_to_dict(revoke_mandate(db, mandate_id))
    except ServiceError as e:
        raise _http(e)


@router.get("/mandates")
def list_mandates_route(
    user_id: str = Query(..., min_length=1), db: Session = Depends(get_db)
) -> list[dict]:
    return [mandate_to_dict(m) for m in list_mandates_for_user(db, user_id)]
