"""Pipeline constants and env readers. Read as limits.NAME at call time."""
import os

STEP_TIMEOUT_S = 8.0
AI_RETRIES = 1
PAY_RETRIES = 2
PAY_BACKOFF_S = 0.2
RENDER_START_TIMEOUT_S = 3.0
RENDER_WAIT_S = 10.0
RENDER_POLL_S = 0.25
RENDER_TASK_TIMEOUT_S = 30
MAX_FINDINGS = 20


def pipeline_mode() -> str:
    v = os.environ.get("PIPELINE_MODE", "local").strip().lower()
    return v if v in ("local", "render") else "local"


def stubs_enabled() -> bool:
    from app.paypal.service import paypal_mode
    return os.environ.get("PIPELINE_STUBS", "") == "1" and paypal_mode() == "mock"


def approval_timeout_min() -> int:
    from app.policy import APPROVAL_TIMEOUT_MIN
    try:
        v = int(os.environ.get("APPROVAL_TIMEOUT_MIN", ""))
    except ValueError:
        return APPROVAL_TIMEOUT_MIN
    return v if 1 <= v <= 1440 else APPROVAL_TIMEOUT_MIN
