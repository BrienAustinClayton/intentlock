"""LLM router — GET /llm/usage."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.jev import usage_summary

router = APIRouter(tags=["llm"])


@router.get("/llm/usage")
def llm_usage(db: Session = Depends(get_db)) -> dict:
    return usage_summary(db)
