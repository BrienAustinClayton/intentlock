"""graph_risk against in-memory stores (lab seed + synthetic). No database needed."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from intentlock_graph import graph_risk, flag_merchant
from intentlock_graph import build as build_mod
from intentlock_graph.build import build_store
from intentlock_graph.store import NetworkXStore

NOW = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)
ERR = {"result": "error", "score": None, "signals": []}


@pytest.fixture(autouse=True)
def _flags(tmp_path, monkeypatch):
    monkeypatch.setenv("INTENTLOCK_GRAPH_FLAGS_PATH", str(tmp_path / "flags.json"))
    monkeypatch.setattr(build_mod, "_MEM_FLAGS", {})


def names(r):
    return {s["name"]: s for s in r["signals"]}


def seed_store():
    return build_store(None)


def order(agent, merchant, **kw):
    return {"order_id": "ord_t1", "agent_id": agent, "merchant": merchant, "created_at": NOW, **kw}


def test_priya_normal_order_is_low():
    r = graph_risk(order("agt_demo_shopper", "freshmart", user_id="usr_demo_priya"), store=seed_store())
    assert r["score"] < 30
    assert r["signals"] == []


def test_bot_farm_scenario_scores_high_with_node_evidence():
    store = seed_store()
    r = graph_risk(order("agt_lab_bot_07", "dealsdaily"), store=store)
    assert r["score"] >= 60
    sig = names(r)
    assert "bot_farm" in sig and 60 <= sig["bot_farm"]["weight"] <= 80
    for s in r["signals"]:
        assert s["evidence"], s
        for node in s["evidence"]:
            assert store.has_node(node) or node in ("ord_t1",), node
    assert "agt_lab_bot_07" in sig["bot_farm"]["evidence"]
    assert "merchant_dealsdaily" in sig["bot_farm"]["evidence"]
    assert "dev_shared_bot_02" in sig["bot_farm"]["evidence"]


def _shared_key_store(n_agents, *, verified=False, same_device=False):
    s = NetworkXStore()
    s.upsert_node("key_x", "key")
    s.upsert_node("merchant_freshmart", "merchant", flagged=False)
    for i in range(n_agents):
        aid = f"agt_s{i}"
        s.upsert_node(aid, "agent", verified=verified, revoked=False, device_id=f"dev_s{0 if same_device else i}")
        s.upsert_edge(aid, "key_x", "USES_KEY")
    return s


def test_shared_key_alone_five_agents_is_60():
    r = graph_risk(order("agt_s0", "freshmart"), store=_shared_key_store(5))
    assert list(names(r)) == ["shared_key"]
    assert r["score"] >= 60
    assert names(r)["shared_key"]["weight"] == 60
    assert "key_x" in names(r)["shared_key"]["evidence"]


def test_shared_key_weight_capped_at_70_and_two_agents_is_below_60():
    assert names(graph_risk(order("agt_s0", "freshmart"), store=_shared_key_store(20)))["shared_key"]["weight"] == 70
    assert graph_risk(order("agt_s0", "freshmart"), store=_shared_key_store(2))["score"] < 60


def test_verified_owner_not_flagged_for_copies_but_copy_is():
    s = _shared_key_store(6)
    s.upsert_node("agt_s0", "agent", verified=True, revoked=False, device_id="dev_s0")
    assert graph_risk(order("agt_s0", "freshmart"), store=s)["signals"] == []
    assert graph_risk(order("agt_s3", "freshmart"), store=s)["score"] >= 60


def test_revoked_agents_do_not_count_for_shared_key():
    s = _shared_key_store(5)
    s.upsert_node("agt_s4", "agent", verified=False, revoked=True)
    assert graph_risk(order("agt_s0", "freshmart"), store=s)["score"] < 60


def test_bot_farm_needs_five_recent_orders_when_no_rapid_edge():
    s = _shared_key_store(6, same_device=True)
    s.upsert_node("merchant_shop", "merchant", flagged=False)
    for i in range(1, 6):
        s.upsert_node(f"o{i}", "order", created_at=NOW - timedelta(minutes=i))
        s.upsert_edge(f"agt_s{i}", f"o{i}", "PLACED_ORDER")
        s.upsert_edge(f"o{i}", "merchant_shop", "ORDER_AT", created_at=NOW - timedelta(minutes=i))
    r = graph_risk(order("agt_s0", "shop"), store=s)
    assert "bot_farm" in names(r)
    assert any(o in names(r)["bot_farm"]["evidence"] for o in ("o1", "o2"))
    # same cluster, orders outside the 15 minute window -> only the current order is active
    s2 = _shared_key_store(6, same_device=True)
    s2.upsert_node("merchant_shop", "merchant", flagged=False)
    for i in range(1, 6):
        s2.upsert_node(f"o{i}", "order", created_at=NOW - timedelta(minutes=60 + i))
        s2.upsert_edge(f"agt_s{i}", f"o{i}", "PLACED_ORDER")
        s2.upsert_edge(f"o{i}", "merchant_shop", "ORDER_AT", created_at=NOW - timedelta(minutes=60 + i))
    assert "bot_farm" not in names(graph_risk(order("agt_s0", "shop"), store=s2))


def test_flagged_merchant_raises_score(tmp_path):
    before = graph_risk(order("agt_demo_shopper", "gadgethub", user_id="usr_demo_priya"), store=seed_store())
    assert flag_merchant("gadgethub", "https://gadgethub.example/p/x?y=1") is True
    after = graph_risk(order("agt_demo_shopper", "gadgethub", user_id="usr_demo_priya"), store=seed_store())
    assert after["score"] > before["score"]
    sig = names(after)["flagged_merchant"]
    assert sig["weight"] == 25 and sig["evidence"] == ["merchant_gadgethub"]
    # persisted to the flags file: survives losing in-memory state
    build_mod._MEM_FLAGS.clear()
    again = graph_risk(order("agt_demo_shopper", "gadgethub", user_id="usr_demo_priya"), store=seed_store())
    assert "flagged_merchant" in names(again)


def test_seed_flagged_merchant_counts():
    r = graph_risk(order("agt_demo_shopper", "dealsdaily", user_id="usr_demo_priya"), store=seed_store())
    assert "flagged_merchant" in names(r)


def test_unfamiliar_device_and_out_of_mandate():
    s = seed_store()
    s.upsert_node("agt_new", "agent", user_id="usr_demo_priya", device_id="dev_new", verified=False, revoked=False)
    s.upsert_edge("usr_demo_priya", "agt_new", "OWNS")
    s.upsert_node("dev_new", "device")
    s.upsert_edge("agt_new", "dev_new", "USES_DEVICE")
    s.upsert_node("o_rej", "order", created_at=NOW - timedelta(hours=3), mandate_failed=True)
    s.upsert_edge("agt_new", "o_rej", "PLACED_ORDER")
    s.upsert_node("o_old", "order", created_at=NOW - timedelta(hours=30), mandate_failed=True)
    s.upsert_edge("agt_new", "o_old", "PLACED_ORDER")
    r = graph_risk(order("agt_new", "freshmart"), store=s)
    sig = names(r)
    assert sig["unfamiliar_device"]["weight"] == 15
    assert sig["unfamiliar_device"]["evidence"] == ["usr_demo_priya", "dev_new"]
    assert sig["out_of_mandate"]["weight"] == 20
    assert sig["out_of_mandate"]["evidence"] == ["agt_new", "o_rej"]
    assert r["score"] == 20 + 0.3 * 15


def test_score_capped_at_100():
    s = _shared_key_store(20, same_device=True)
    s.upsert_node("merchant_shop", "merchant", flagged=True)
    s.upsert_node("agt_s0", "agent", verified=False, revoked=False, device_id="dev_s0", user_id="u")
    s.upsert_node("u", "user")
    s.upsert_edge("u", "dev_known", "FAMILIAR_DEVICE")
    s.upsert_node("dev_s0", "device")
    s.upsert_edge("agt_s0", "dev_s0", "USES_DEVICE")
    r = graph_risk(order("agt_s0", "shop"), store=s)
    assert 60 <= r["score"] <= 100


@pytest.mark.parametrize(
    "junk",
    [None, "", "ord_1", 42, 3.14, [], {}, {"x": 1}, object(), {"agent_id": 5, "merchant": 7}, b"bytes", float("nan")],
)
def test_junk_input_never_raises(junk):
    r = graph_risk(junk, store=seed_store())
    assert r["score"] is None or 0 <= r["score"] <= 100
    assert isinstance(r["signals"], list)


@pytest.mark.parametrize("junk", [None, "", {}, {"x": 1}, 42, []])
def test_unusable_input_returns_error_shape(junk):
    assert graph_risk(junk, store=seed_store()) == ERR


def test_internal_error_returns_error_shape(monkeypatch):
    class Boom:
        def copy(self):
            raise RuntimeError("boom")

    assert graph_risk(order("agt_demo_shopper", "freshmart"), store=Boom()) == ERR


def test_unknown_agent_and_bad_dates_do_not_raise():
    r = graph_risk({"agent_id": "agt_nope", "merchant": "weird merchant!!", "created_at": "not-a-date"}, store=seed_store())
    assert r["signals"] == [] and r["score"] == 0


def test_flag_merchant_never_raises():
    assert flag_merchant(None, None) is False
    assert flag_merchant("bad merchant name!", "x") is False
    assert flag_merchant("freshmart", object()) is True


def test_store_subgraph_and_neighbors():
    s = seed_store()
    assert set(s.neighbors("key_shared_bot_cluster", "USES_KEY", "in")) >= {"agt_lab_bot_01", "agt_lab_bot_09"}
    s.upsert_node("o1", "order", created_at=NOW)
    s.upsert_edge("agt_lab_bot_07", "o1", "PLACED_ORDER")
    sub = s.subgraph("o1", hops=1)
    assert {n["id"] for n in sub["nodes"]} == {"o1", "agt_lab_bot_07"}
    assert s.subgraph("missing") == {"nodes": [], "edges": []}
