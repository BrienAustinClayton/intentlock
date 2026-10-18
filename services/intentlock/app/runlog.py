"""One JSON line per agent-run step, same shape as the agent service's log, so both sides can be
matched on run_id when tracing where a purchase request went."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any


def emit(event: str, **fields: Any) -> None:
    line = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "service": "api", "event": event, **{k: v for k, v in fields.items() if v is not None}}
    print(json.dumps(line, default=str), file=sys.stdout, flush=True)
