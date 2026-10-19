"""Schedule router — Bryntum CrudManager protocol.

GET  /schedule/load?user_id=
POST /schedule/sync
POST /schedule/propose
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import agent_or_admin, require_admin
from app.db import get_db
from app.ids import new_id
from app.mandates import update_mandate
from app.models import Agent, Mandate, Order, ScheduleEvent
from app.service_errors import ServiceError
from app.signing import iso_z, parse_iso_z

router = APIRouter(tags=["schedule"])

# ---------------------------------------------------------------------------
# Status maps
# ---------------------------------------------------------------------------

_ORDER_STATUS_TO_EVENT: dict[str, str] = {
    "captured": "captured",
    "voided": "voided",
    "rejected": "rejected",
    "pending_approval": "pending_approval",
}


def _order_event_status(order_status: str) -> str:
    return _ORDER_STATUS_TO_EVENT.get(order_status, "confirmed")


# ---------------------------------------------------------------------------
# Event serialisers
# ---------------------------------------------------------------------------

def _mandate_event(m: Mandate) -> dict[str, Any]:
    return {
        "id": m.id,
        "resourceId": m.agent_id,
        "name": f"Budget window ({m.budget_period})",
        "startDate": iso_z(m.starts_at),
        "endDate": iso_z(m.expires_at) if m.expires_at is not None else None,
        "type": "mandate_window",
        "status": "voided" if m.revoked_at is not None else "confirmed",
    }


def _order_event(o: Order) -> dict[str, Any]:
    return {
        "id": o.id,
        "resourceId": o.agent_id,
        "name": f"{o.merchant} order",
        "startDate": iso_z(o.created_at),
        "endDate": iso_z(o.updated_at),
        "type": "order",
        "status": _order_event_status(o.status),
        "order_id": o.id,
    }


def _schedule_event(e: ScheduleEvent) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": e.id,
        "resourceId": e.agent_id,
        "name": e.title,
        "startDate": iso_z(e.start),
        "endDate": iso_z(e.end),
        "type": e.type,
        "status": e.status,
    }
    if e.order_id is not None:
        d["order_id"] = e.order_id
    return d


# ---------------------------------------------------------------------------
# GET /schedule/load
# ---------------------------------------------------------------------------

@router.get("/schedule/load", dependencies=[Depends(require_admin)])
def schedule_load(
    user_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # ---- resources: agents for this user ----
    agent_stmt = select(Agent)
    if user_id is not None:
        agent_stmt = agent_stmt.where(Agent.user_id == user_id)
    agents = list(db.execute(agent_stmt).scalars().all())
    agent_ids = [a.id for a in agents]

    resource_rows = [{"id": a.id, "name": a.name} for a in agents]

    event_rows: list[dict[str, Any]] = []
    assignment_rows: list[dict[str, Any]] = []

    if agent_ids:
        # mandate_window events
        mandate_stmt = select(Mandate).where(Mandate.agent_id.in_(agent_ids))
        mandates = list(db.execute(mandate_stmt).scalars().all())
        for m in mandates:
            ev = _mandate_event(m)
            event_rows.append(ev)
            assignment_rows.append({
                "id": f"asgn_{m.id}",
                "eventId": m.id,
                "resourceId": m.agent_id,
            })

        # order events
        order_stmt = select(Order).where(Order.agent_id.in_(agent_ids))
        orders = list(db.execute(order_stmt).scalars().all())
        for o in orders:
            ev = _order_event(o)
            event_rows.append(ev)
            assignment_rows.append({
                "id": f"asgn_{o.id}",
                "eventId": o.id,
                "resourceId": o.agent_id,
            })

        # planned_purchase events from schedule_events table
        se_stmt = select(ScheduleEvent).where(
            ScheduleEvent.agent_id.in_(agent_ids),
            ScheduleEvent.type == "planned_purchase",
        )
        schedule_events = list(db.execute(se_stmt).scalars().all())
        for e in schedule_events:
            ev = _schedule_event(e)
            event_rows.append(ev)
            assignment_rows.append({
                "id": f"asgn_{e.id}",
                "eventId": e.id,
                "resourceId": e.agent_id,
            })

    return {
        "success": True,
        "resources": {"rows": resource_rows},
        "events": {"rows": event_rows},
        "assignments": {"rows": assignment_rows},
    }


# ---------------------------------------------------------------------------
# POST /schedule/sync
# ---------------------------------------------------------------------------

class _SyncBody(BaseModel):
    requestId: Optional[Any] = None
    events: Optional[dict[str, Any]] = None
    resources: Optional[dict[str, Any]] = None


@router.post("/schedule/sync", dependencies=[Depends(require_admin)])
def schedule_sync(
    body: _SyncBody,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Apply added/updated/removed schedule events.

    - added:   only planned_purchase events are created via this endpoint.
    - updated: mandate_window id → calls update_mandate (re-signs).
               planned_purchase id → updates the ScheduleEvent row.
    - removed: planned_purchase events only.

    Returns $PhantomId → real id mapping.
    """
    events_payload = body.events or {}
    added = events_payload.get("added") or []
    updated = events_payload.get("updated") or []
    removed = events_payload.get("removed") or []

    phantom_rows: list[dict[str, Any]] = []
    errors: list[str] = []

    # ---- added ----
    for item in added:
        phantom_id = item.get("$PhantomId")
        evt_type = item.get("type", "planned_purchase")
        if evt_type != "planned_purchase":
            errors.append(f"Cannot create events of type '{evt_type}' via sync")
            continue
        agent_id = item.get("resourceId")
        if not agent_id:
            errors.append("added event missing resourceId")
            continue
        agent = db.get(Agent, agent_id)
        if agent is None:
            errors.append(f"agent {agent_id!r} not found")
            continue
        start_raw = item.get("startDate")
        end_raw = item.get("endDate")
        if not start_raw or not end_raw:
            errors.append("added event missing startDate or endDate")
            continue
        evt = ScheduleEvent(
            id=new_id("evt"),
            agent_id=agent_id,
            type="planned_purchase",
            title=item.get("name") or "Planned purchase",
            start=parse_iso_z(start_raw),
            end=parse_iso_z(end_raw),
            status=item.get("status") or "tentative",
            order_id=item.get("order_id"),
        )
        db.add(evt)
        db.flush()
        row: dict[str, Any] = {"id": evt.id}
        if phantom_id is not None:
            row["$PhantomId"] = phantom_id
        phantom_rows.append(row)

    # ---- updated ----
    for item in updated:
        evt_id = item.get("id")
        if not evt_id:
            continue
        if evt_id.startswith("mdt_"):
            # mandate_window update → re-sign via update_mandate
            changes: dict[str, Any] = {}
            if "endDate" in item:
                changes["expires_at"] = parse_iso_z(item["endDate"])
            if "startDate" in item:
                changes["starts_at"] = parse_iso_z(item["startDate"])
            if changes:
                try:
                    update_mandate(db, evt_id, changes)
                except ServiceError as e:
                    errors.append(f"mandate update failed: {e.reason}")
        else:
            # planned_purchase update
            evt = db.get(ScheduleEvent, evt_id)
            if evt is not None and evt.type == "planned_purchase":
                if "startDate" in item:
                    evt.start = parse_iso_z(item["startDate"])
                if "endDate" in item:
                    evt.end = parse_iso_z(item["endDate"])
                if "name" in item:
                    evt.title = item["name"]
                if "status" in item:
                    evt.status = item["status"]
                db.flush()

    # ---- removed ----
    for item in removed:
        evt_id = item.get("id")
        if not evt_id:
            continue
        evt = db.get(ScheduleEvent, evt_id)
        if evt is not None and evt.type == "planned_purchase":
            db.delete(evt)
            db.flush()

    db.commit()

    resp: dict[str, Any] = {
        "success": True,
        "events": {"rows": phantom_rows},
    }
    if body.requestId is not None:
        resp["requestId"] = body.requestId
    if errors:
        resp["errors"] = errors
    return resp


# ---------------------------------------------------------------------------
# POST /schedule/propose
# ---------------------------------------------------------------------------

class _ProposeBody(BaseModel):
    agent_id: str
    title: str
    start: str
    end: str


@router.post("/schedule/propose", status_code=201)
def schedule_propose(
    body: _ProposeBody,
    signer: Optional[Agent] = Depends(agent_or_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create a tentative planned_purchase event (the signing agent, for itself only)."""
    agent = db.get(Agent, body.agent_id)
    if agent is None or (signer is not None and signer.id != agent.id):
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "reason": "agent not found"},
        )
    evt = ScheduleEvent(
        id=new_id("evt"),
        agent_id=body.agent_id,
        type="planned_purchase",
        title=body.title,
        start=parse_iso_z(body.start),
        end=parse_iso_z(body.end),
        status="tentative",
        order_id=None,
    )
    db.add(evt)
    db.commit()
    db.refresh(evt)
    return _schedule_event(evt)
