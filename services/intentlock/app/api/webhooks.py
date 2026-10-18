"""Webhooks router — POST /webhooks/paypal."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["webhooks"])


@router.post("/webhooks/paypal", status_code=501)
async def paypal_webhook():
    return JSONResponse(
        status_code=501,
        content={"error": "not_implemented", "reason": "POST /webhooks/paypal not yet implemented"},
    )
