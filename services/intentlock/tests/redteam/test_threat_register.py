"""The 32 agentic-commerce threats ("Connecting the Dots in Agentic AI Security", arXiv:2609.23894), each mapped to
the tests that prove Sepilo's control. Fails if a threat has no test or a referenced test disappears.
docs/SECURITY_THREATS.md is the readable version of this table.

Test refs: "<path under services/intentlock/tests>::<test function>" or "agent:<file under apps/agent/src>::<test name>".
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

TESTS = Path(__file__).resolve().parents[1]
AGENT = TESTS.parents[2] / "apps" / "agent" / "src"

E2E = "security/test_security_e2e.py"
ROUTES = "security/test_route_access.py"
GUARDS = "redteam/test_source_guards.py"
CART = "test_cart_review.py"
PIPE = "test_pipeline.py"
ME = "test_me.py"
HOSTED_SECRET = "agent:server.test.ts::hosted run with agent credentials needs the run secret"
AGENT_LISTINGS = "agent:untrusted.test.ts::agent-directed or hidden text is dropped before the model"
AGENT_SSRF = "agent:safeFetch.test.ts::agent page fetches refuse private, metadata and odd URLs"

THREATS: dict[int, tuple[str, list[str]]] = {
    1: ("Goal hijacking", [f"{CART}::test_agent_directed_listing_text_blocks_without_jev",
                           f"{ME}::test_poisoned_listings_and_leaky_replies_never_reach_the_user",
                           f"{PIPE}::test_checkout_must_match_the_cart_the_user_approved"]),
    2: ("Task-state corruption", [f"{PIPE}::test_one_order_per_purchase_request",
                                  f"{PIPE}::test_checkout_must_match_the_cart_the_user_approved",
                                  f"{ME}::test_agent_cannot_claim_someone_elses_order"]),
    3: ("Constraint bypass", [f"{PIPE}::test_checkout_uses_channel3_category_not_the_agents",
                              f"{E2E}::test_tampered_mandate_rejects_before_any_payment",
                              f"{CART}::test_rule_failure_blocks_even_if_jev_approves"]),
    4: ("Objective drift", [f"{ME}::test_chat_context_is_only_this_users_chat",
                            f"{CART}::test_jev_mismatch_or_odd_quantity_asks_the_user"]),
    5: ("Direct prompt injection", [f"{CART}::test_reply_guard_hides_prompt_extraction",
                                    f"{ME}::test_hosted_agent_key_is_sealed_and_never_returned"]),
    6: ("Indirect prompt injection", [f"{E2E}::test_llm_cannot_clear_a_heuristic_injection_flag",
                                      f"{CART}::test_agent_directed_listing_text_blocks_without_jev",
                                      AGENT_LISTINGS]),
    7: ("Plan manipulation", [f"{PIPE}::test_checkout_store_must_sell_the_product",
                              f"{PIPE}::test_checkout_price_must_match_channel3"]),
    8: ("Reflection poisoning", [f"{PIPE}::test_one_order_per_purchase_request",
                                 f"{ME}::test_watchdog_resends_unsent_and_fails_lost_runs"]),
    9: ("Cascading hallucination", [f"{PIPE}::test_checkout_price_must_match_channel3",
                                    f"{PIPE}::test_checkout_uses_channel3_category_not_the_agents",
                                    f"{CART}::test_jev_mismatch_or_odd_quantity_asks_the_user"]),
    10: ("System-prompt extraction", [f"{CART}::test_reply_guard_hides_prompt_extraction",
                                      f"{ME}::test_poisoned_listings_and_leaky_replies_never_reach_the_user"]),
    11: ("Business-rule inference", [f"{ME}::test_proof_is_private_to_the_owner_and_checks_hide_internals",
                                     f"{ROUTES}::test_route_rejects_anonymous"]),
    12: ("Tool-schema disclosure", [f"{ROUTES}::test_api_schema_is_private_by_default",
                                    f"{GUARDS}::test_agent_tools_are_a_fixed_allow_list"]),
    13: ("Short-term context poisoning", [f"{ME}::test_chat_context_is_only_this_users_chat",
                                         f"{CART}::test_listing_hygiene"]),
    14: ("Persistent memory poisoning", [f"{GUARDS}::test_agent_memory_is_session_only",
                                        f"{ME}::test_chat_context_is_only_this_users_chat"]),
    15: ("RAG knowledge poisoning", [f"{GUARDS}::test_no_shared_writable_knowledge_store",
                                    f"{PIPE}::test_checkout_price_must_match_channel3"]),
    16: ("Cross-session memory leakage", [f"{ME}::test_agents_requests_orders_are_isolated",
                                         f"{ME}::test_proof_is_private_to_the_owner_and_checks_hide_internals",
                                         f"{ME}::test_chat_context_is_only_this_users_chat"]),
    17: ("Shared-memory contamination", [f"{GUARDS}::test_no_shared_writable_knowledge_store"]),
    18: ("Unauthorized tool invocation", [f"{ROUTES}::test_route_rejects_anonymous",
                                         f"{ME}::test_large_approval_needs_the_total_typed"]),
    19: ("Tool abuse / scope expansion", [f"{ROUTES}::test_route_rejects_anonymous",
                                         f"{PIPE}::test_agent_reads_only_its_own_intent_with_a_signature",
                                         "test_lab.py::test_lab_reset_keeps_other_users_orders", AGENT_SSRF]),
    20: ("Malicious tool/plugin", [f"{GUARDS}::test_agent_tools_are_a_fixed_allow_list"]),
    21: ("Tool-response poisoning", [f"{PIPE}::test_checkout_price_must_match_channel3",
                                    f"{ME}::test_agent_cannot_claim_someone_elses_order",
                                    f"{ME}::test_run_summary_comes_from_the_order_not_the_agent"]),
    22: ("Unexpected code execution", [f"{GUARDS}::test_no_code_execution_on_input"]),
    23: ("Payment-action abuse", [f"{PIPE}::test_agent_daily_order_limit",
                                 f"{ME}::test_cart_checkouts_are_rate_limited",
                                 f"{PIPE}::test_one_order_per_purchase_request",
                                 f"{E2E}::test_replayed_signature_is_rejected_and_makes_no_second_order"]),
    24: ("Human approval fatigue", [f"{PIPE}::test_pending_approvals_are_capped_per_agent",
                                   f"{ME}::test_large_approval_needs_the_total_typed"]),
    25: ("Deceptive agent behavior", [f"{ME}::test_run_summary_comes_from_the_order_not_the_agent",
                                     f"{E2E}::test_proof_tamper_is_invalid"]),
    26: ("User impersonation", [f"{ME}::test_payment_method_change_needs_a_fresh_sign_in",
                               f"{ME}::test_new_agent_sends_a_security_notice",
                               f"{ROUTES}::test_route_rejects_anonymous"]),
    27: ("Agent impersonation", [f"{E2E}::test_agent_cannot_sign_with_another_agents_keyid",
                                f"{PIPE}::test_lab_test_key_agent_cannot_use_real_checkout", HOSTED_SECRET]),
    28: ("Unauthorized delegation", [f"{GUARDS}::test_agent_signature_cannot_reach_user_or_operator_routes",
                                    f"{ME}::test_hosted_agent_key_is_sealed_and_never_returned"]),
    29: ("Inter-agent message poisoning", [f"{ME}::test_agent_cannot_claim_someone_elses_order",
                                          f"{ME}::test_run_summary_comes_from_the_order_not_the_agent",
                                          HOSTED_SECRET]),
    30: ("Byzantine/collusive agents", [f"{E2E}::test_compromised_jev_cannot_clear_a_rule_flag",
                                       f"{CART}::test_jev_cannot_clear_a_code_block"]),
    31: ("Environment/content injection", [f"{E2E}::test_hostile_page_urls_fail_closed_and_leak_nothing",
                                          f"{CART}::test_agent_directed_listing_text_blocks_without_jev",
                                          f"{E2E}::test_injected_cart_text_never_reaches_reasons"]),
    32: ("Web/browser manipulation", [AGENT_SSRF, f"{GUARDS}::test_agent_tools_are_a_fixed_allow_list",
                                     f"{E2E}::test_one_hostile_page_among_good_ones_fails_the_whole_scan"]),
}


def _exists(ref: str) -> bool:
    if ref.startswith("agent:"):
        file, name = ref[len("agent:"):].split("::", 1)
        path = AGENT / file
        return path.exists() and f'test("{name}"' in path.read_text()
    file, name = ref.split("::", 1)
    path = TESTS / file
    return path.exists() and re.search(rf"^(async )?def {re.escape(name)}\(", path.read_text(), re.M) is not None


def test_all_32_threats_are_covered():
    assert sorted(THREATS) == list(range(1, 33))
    assert all(refs for _, refs in THREATS.values())


@pytest.mark.parametrize("number", sorted(THREATS), ids=[f"{n:02d}-{THREATS[n][0]}" for n in sorted(THREATS)])
def test_threat_has_live_tests(number):
    name, refs = THREATS[number]
    missing = [r for r in refs if not _exists(r)]
    assert not missing, f"Threat {number} ({name}) references missing tests: {missing}"
