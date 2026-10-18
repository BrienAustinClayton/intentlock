"""Domain error raised by service functions; routers convert it to HTTPException."""
from __future__ import annotations


class ServiceError(Exception):
    def __init__(self, status_code: int, error: str, reason: str) -> None:
        super().__init__(reason)
        self.status_code = status_code
        self.error = error
        self.reason = reason
