"""Users router — POST /users."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["users"])


@router.post("/users", status_code=501)
async def create_user():
    return JSONResponse(
        status_code=501,
        content={"error": "not_implemented", "reason": "POST /users not yet implemented"},
    )
