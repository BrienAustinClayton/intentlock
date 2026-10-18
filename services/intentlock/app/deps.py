"""Shared FastAPI dependencies."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.crypto.http_sig import AgentVerificationError, verify_request
from app.db import get_db
from app.models import Agent


async def require_agent(request: Request, db: Session = Depends(get_db)) -> Agent:
    body = await request.body()
    try:
        return verify_request(request, body, db)
    except AgentVerificationError as e:
        raise HTTPException(
            status_code=401,
            detail={"error": "agent_verification_failed", "reason": e.reason},
        )
