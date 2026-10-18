"""AI compute functions for the pipeline (plain data in, plain data out)."""
from __future__ import annotations

import importlib
import logging
from typing import Any, Callable

from app.checks import injection_rules, intent_diff_rules
from app.pipeline import limits, stubs
from app.pipeline.context import OrderSnapshot, PipelineContext

log = logging.getLogger("intentlock.pipeline")

ISSUES = ("none", "extra_item", "variant_mismatch", "quantity", "price", "address", "merchant")
EXPLAINED = ("yes", "no", "uncertain")


def _catalog():
    try:
        from app.api.catalog import _load_catalog
        return _load_catalog()
    except Exception:
        return None


def _import_injection_classifier() -> Callable | None:
    try:
        from app.checks.injection import scan_injection
        return scan_injection
    except ImportError:
        return None


def _import_llm_intent_diff() -> Callable | None:
    try:
        from app.checks.intent_diff import intent_diff
        return intent_diff
    except ImportError:
        return None


def _import_graph_risk() -> Callable | None:
    for mod, attr in (("intentlock_graph.risk", "graph_risk"), ("intentlock_graph", "graph_risk")):
        try:
            m = importlib.import_module(mod)
        except ImportError:
            continue
        fn = getattr(m, attr, None)
        if callable(fn):
            return fn
    return None


def load_injection_scanner() -> Callable:
    return _import_injection_classifier() or injection_rules.scan_injection


def load_llm_intent_diff() -> Callable | None:
    fn = _import_llm_intent_diff()
    return fn if fn else (stubs.llm_intent_diff_stub if limits.stubs_enabled() else None)


def load_graph_risk() -> Callable | None:
    fn = _import_graph_risk()
    return fn if fn else (stubs.graph_risk_stub if limits.stubs_enabled() else None)


def _trim_injection(out: Any) -> dict:
    if not isinstance(out, dict):
        return {"result": "error", "error": "bad_output", "detected": False, "confidence": None, "findings": []}
    res = {k: out[k] for k in ("result", "detected", "confidence", "error") if k in out}
    findings = []
    raw = out.get("findings")
    for f in (raw if isinstance(raw, list) else []):
        if not isinstance(f, dict):
            continue
        findings.append({
            "url": str(f.get("url", ""))[:2048],
            "technique": str(f.get("technique", ""))[:32],
            "snippet": str(f.get("snippet", ""))[:200],
        })
        if len(findings) >= limits.MAX_FINDINGS:
            break
    res["findings"] = findings
    if isinstance(out.get("errors"), list):
        res["errors"] = out["errors"][:20]
    return res


def compute_scan_injection(ctx: PipelineContext) -> dict:
    scanner = load_injection_scanner()
    kwargs = {"allow_fixtures": ctx.allow_fixtures}
    if scanner is not injection_rules.scan_injection:  # classifier also scans cart text and flags the merchant
        kwargs.update(cart=list(ctx.cart), merchant=ctx.merchant)
    return _trim_injection(scanner(list(ctx.page_urls), **kwargs))


def _enrich_cart(ctx: PipelineContext, catalog) -> list:
    by_id = {p["product_id"]: p for p in (catalog or []) if isinstance(p, dict) and "product_id" in p}
    out = []
    for i, l in enumerate(ctx.cart):
        p = by_id.get(l.get("product_id"), {})
        out.append({
            "i": i,
            "product_id": l.get("product_id"),
            "title": l.get("title", ""),
            "variant": l.get("variant"),
            "qty": l.get("qty"),
            "unit_price": l.get("unit_price"),
            "category": l.get("category"),
            "merchant": ctx.merchant,
            "description": str(p.get("description") or "")[:1000],
            "key_features": list(p.get("key_features") or [])[:10],
            "other_offers": [o for o in (p.get("offers") or [])
                             if isinstance(o, dict) and o.get("merchant") != ctx.merchant][:5],
        })
    return out


def merge_intent_diff(rule: dict, llm: Any) -> dict:
    r_items = rule.get("items", [])
    if not isinstance(llm, dict) or not isinstance(llm.get("items"), list) or len(llm["items"]) != len(r_items):
        return rule
    out = []
    for r, l in zip(r_items, llm["items"]):
        if r.get("explained") == "no" or r.get("issue", "none") != "none" or not isinstance(l, dict):
            out.append(r)  # deterministic flags win
            continue
        if l.get("explained") in EXPLAINED and l.get("issue") in ISSUES:
            m = {**r, "explained": l["explained"], "issue": l["issue"],
                 "reason": str(l.get("reason") or "")[:160], "source": "llm"}
            if isinstance(l.get("probabilities"), dict):
                m["probabilities"] = l["probabilities"]
            out.append(m)
        else:
            out.append(r)
    return {"items": out,
            "price_anomaly": bool(rule.get("price_anomaly")) or llm.get("price_anomaly") is True}


def compute_intent_diff(ctx: PipelineContext) -> dict:
    catalog = _catalog()
    rule = intent_diff_rules.rule_diff(ctx.request_text, ctx.mandate, ctx.cart, ctx.shipping_address,
                                       catalog, ctx.merchant)
    hook = load_llm_intent_diff()
    if hook is None or not any(i.get("explained") == "uncertain" for i in rule.get("items", [])):
        return rule
    try:
        llm = hook(ctx.request_text, ctx.mandate, _enrich_cart(ctx, catalog), rule)
    except Exception:
        log.warning("pipeline.intent_hook_failed order_id=%s", ctx.order_id)
        return rule
    return merge_intent_diff(rule, llm)


def compute_graph_risk(ctx: PipelineContext) -> dict:
    fn = load_graph_risk()
    if fn is None:
        return {"result": "error", "error": "graph_unavailable", "score": None, "signals": []}
    # Dict snapshot; db=None so graph_risk opens its own connection (thread-safe, no shared Session).
    out = fn(OrderSnapshot.from_ctx(ctx).to_dict())
    if not isinstance(out, dict):
        return {"result": "error", "error": "graph_bad_output", "score": None, "signals": []}
    res = {k: out[k] for k in ("result", "score", "error") if k in out}
    sig = out.get("signals")
    res["signals"] = [
        {"name": s.get("name"), "weight": s.get("weight"), "evidence": list(s.get("evidence") or [])[:20]}
        for s in (sig if isinstance(sig, list) else []) if isinstance(s, dict)
    ][:20]
    return res
