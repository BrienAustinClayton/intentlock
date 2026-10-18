"""Opt-in demo stubs. Used only when limits.stubs_enabled() (PIPELINE_STUBS=1 and PAYPAL_MODE=mock)."""


def graph_risk_stub(order) -> dict:
    return {"score": 0, "signals": []}


def llm_intent_diff_stub(request_text, mandate, cart_enriched, rule_result) -> dict:
    items = []
    for it in rule_result.get("items", []):
        it = dict(it)
        if it.get("explained") == "uncertain" and it.get("issue") == "none":
            it.update(explained="yes", source="llm", reason="Assumed explained (local stub)")
        items.append(it)
    return {"items": items, "price_anomaly": bool(rule_result.get("price_anomaly"))}
