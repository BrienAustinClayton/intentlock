"""Agents router — POST /agents, POST /agents/{id}/revoke, GET /.well-known/agent-keys."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crypto.keys import load_public_key
from app.db import get_db
from app.ids import new_id
from app.models import Agent, User

router = APIRouter(tags=["agents"])


class AgentCreate(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=100)
    public_key: str = Field(min_length=1, max_length=64)
    device_id: str = Field(min_length=1, max_length=128)


def _agent_out(a: Agent) -> dict:
    return {
        "id": a.id,
        "user_id": a.user_id,
        "name": a.name,
        "public_key": a.public_key,
        "device_id": a.device_id,
        "verified": a.verified,
        "revoked_at": a.revoked_at.isoformat() if a.revoked_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.post("/agents", status_code=201)
def create_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    if db.get(User, payload.user_id) is None:
        raise HTTPException(
            404, detail={"error": "not_found", "reason": "user_not_found"}
        )
    try:
        load_public_key(payload.public_key)
    except ValueError:
        raise HTTPException(
            422, detail={"error": "unprocessable", "reason": "invalid_public_key"}
        )
    agent = Agent(
        id=new_id("agt"),
        user_id=payload.user_id,
        name=payload.name,
        public_key=payload.public_key.strip(),
        device_id=payload.device_id,
        verified=False,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return _agent_out(agent)


@router.post("/agents/{agent_id}/revoke")
def revoke_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(
            404, detail={"error": "not_found", "reason": "agent_not_found"}
        )
    if agent.revoked_at is None:
        agent.revoked_at = datetime.now(UTC)
        db.commit()
    db.refresh(agent)
    return _agent_out(agent)


@router.get("/.well-known/agent-keys")
def agent_keys(db: Session = Depends(get_db)):
    rows = db.execute(select(Agent).order_by(Agent.created_at, Agent.id)).scalars().all()
    return {
        "keys": [
            {
                "keyid": a.id,
                "alg": "ed25519",
                "public_key": a.public_key,
                "revoked": a.revoked_at is not None,
            }
            for a in rows
        ]
    }
