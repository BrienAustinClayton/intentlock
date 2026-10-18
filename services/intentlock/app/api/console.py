"""Console router — GET /console/metrics.

Returns:
  decisions_over_time  — per-hour decision counts for the past 24 h
  risk_histogram       — graph_risk score distribution in 10-pt buckets
  top_flagged_merchants — top 5 merchants with flagged_merchant signal
  approval_rate        — fraction of pending_approval orders that were approved
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Approval, Check, Order

router = APIRouter(tags=["console"])

_DECISIONS = ("reject", "void", "hold", "capture")
_BUCKETS = [f"{i}-{i + 9}" for i in range(0, 100, 10)] + ["100"]


@router.get("/console/metrics")
def console_metrics(db: Session = Depends(get_db)) -> dict[str, Any]:
    # ------------------------------------------------------------------ #
    # decisions_over_time — last 24 h, 1-hour buckets
    # ------------------------------------------------------------------ #
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    orders = list(
        db.execute(
            select(Order).where(Order.created_at >= cutoff)
        ).scalars().all()
    )

    # Build hour buckets
    hour_map: dict[str, dict[str, int]] = {}
    for o in orders:
        # Truncate to hour
        ts = o.created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        hour_key = ts.strftime("%Y-%m-%dT%H:00:00Z")
        if hour_key not in hour_map:
            hour_map[hour_key] = {d: 0 for d in _DECISIONS}
        if o.decision in _DECISIONS:
            hour_map[hour_key][o.decision] += 1

    decisions_over_time = [
        {"hour": hour, **counts}
        for hour, counts in sorted(hour_map.items())
    ]

    # ------------------------------------------------------------------ #
    # risk_histogram — 10-pt buckets from graph_risk checks
    # ------------------------------------------------------------------ #
    graph_checks = list(
        db.execute(
            select(Check).where(Check.step == "graph_risk")
        ).scalars().all()
    )
    histogram: dict[str, int] = {b: 0 for b in _BUCKETS}
    for chk in graph_checks:
        if chk.score is not None:
            score = float(chk.score)
            if score == 100:
                histogram["100"] += 1
            else:
                bucket_idx = int(score // 10)
                bucket_idx = min(bucket_idx, 9)
                histogram[_BUCKETS[bucket_idx]] += 1

    risk_histogram = [
        {"bucket": bucket, "count": count}
        for bucket, count in histogram.items()
    ]

    # ------------------------------------------------------------------ #
    # top_flagged_merchants — merchants appearing in flagged_merchant signals
    # ------------------------------------------------------------------ #
    merchant_counts: dict[str, int] = {}
    for chk in graph_checks:
        if not isinstance(chk.details_json, dict):
            continue
        signals = chk.details_json.get("signals") or []
        for sig in signals:
            if not isinstance(sig, dict):
                continue
            if sig.get("name") != "flagged_merchant":
                continue
            # evidence contains node ids; try to find merchant names in order merchant
            order = db.get(Order, chk.order_id)
            if order:
                merchant_counts[order.merchant] = merchant_counts.get(order.merchant, 0) + 1

    top_flagged_merchants = [
        {"merchant": m, "count": c}
        for m, c in sorted(merchant_counts.items(), key=lambda x: -x[1])[:5]
    ]

    # ------------------------------------------------------------------ #
    # approval_rate — approved / total among orders that had approval
    # ------------------------------------------------------------------ #
    approvals = list(db.execute(select(Approval)).scalars().all())
    total_decided = sum(1 for a in approvals if a.decision is not None)
    approved = sum(1 for a in approvals if a.decision == "approve")
    approval_rate = (approved / total_decided) if total_decided > 0 else 0.0

    return {
        "decisions_over_time": decisions_over_time,
        "risk_histogram": risk_histogram,
        "top_flagged_merchants": top_flagged_merchants,
        "approval_rate": approval_rate,
    }
