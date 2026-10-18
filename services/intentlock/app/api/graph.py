"""Graph router — GET /graph/risk/{order_id}, POST /graph/ask."""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from intentlock_graph import graph_risk
from intentlock_graph.ask import ask
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Order

router = APIRouter(tags=["graph"])


@router.get("/graph/risk/{order_id}")
def graph_risk_route(order_id: str, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if order is None:
        return JSONResponse(
            status_code=404,
            content={"error": "not_found", "reason": "order_not_found"},
        )
    # graph_risk never raises; internal errors come back as {"result": "error", ...}
    return graph_risk(order, db=db)


class AskBody(BaseModel):
    question: str = Field(min_length=1, max_length=500)


@router.post("/graph/ask")
def graph_ask(body: AskBody, db: Session = Depends(get_db)):
    # ask() never raises: LLM failure gives a deterministic summary, no data gives "not enough data".
    return ask(body.question, db)
