"""Global error handling for the IntentLock API."""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    from fastapi.exceptions import HTTPException as FastAPIHTTPException
    from starlette.exceptions import HTTPException as StarletteHTTPException

    status_code: int
    detail: object

    if isinstance(exc, (FastAPIHTTPException, StarletteHTTPException)):
        status_code = exc.status_code
        detail = exc.detail
    else:
        status_code = 500
        detail = "An unexpected error occurred."

    # If the detail is already a dict with error/reason shape, pass it through.
    if isinstance(detail, dict) and "error" in detail and "reason" in detail:
        return JSONResponse(status_code=status_code, content=detail)

    return JSONResponse(
        status_code=status_code,
        content={
            "error": _status_to_code(status_code),
            "reason": detail if isinstance(detail, str) else str(detail),
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "reason": "An unexpected error occurred."},
    )


def _status_to_code(status: int) -> str:
    mapping = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        422: "unprocessable",
        501: "not_implemented",
    }
    return mapping.get(status, f"http_{status}")
