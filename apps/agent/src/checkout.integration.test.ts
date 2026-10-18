/**
 * Integration test against the local IntentLock API (skipped when it is down or the agent key is missing).
 * No LLM: it exercises the signed GET /intents/{id} and signed POST /checkout the checkout tool uses.
 * Uses one FreshMart item; run `uv run python ../../scripts/reset_demo.py` (services/intentlock) to free the budget.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentId, apiUrl, env } from "./config.ts";
import { getIntent, signedFetch } from "./intentlock.ts";
import { catalogSearch } from "./catalog.ts";

async function apiUp(): Promise<boolean> {
  try {
    return (await fetch(`${apiUrl()}/health`, { signal: AbortSignal.timeout(2000) })).ok && !!env("AGENT_PRIVATE_KEY");
  } catch {
    return false;
  }
}

test("signed intent read + signed checkout returns captured or pending_approval", async (t) => {
  if (!(await apiUp())) return t.skip("IntentLock API or AGENT_PRIVATE_KEY not available");
  const created = await (
    await fetch(`${apiUrl()}/intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: "usr_demo_priya", agent_id: agentId(), request_text: "Toddler milk from FreshMart, under $80" }),
    })
  ).json() as { id: string };
  const intent = await getIntent(created.id);
  assert.equal(intent.id, created.id);

  const [p] = await catalogSearch("toddler", "freshmart", 1);
  assert.ok(p, "catalog has a FreshMart toddler product");
  const r = await signedFetch<{ order_id: string; status: string }>("POST", "/checkout", {
    intent_id: intent.id,
    merchant: "freshmart",
    cart: [{ product_id: p.product_id, title: p.title, variant: null, qty: 1, unit_price: p.price, currency: p.currency, category: p.category, url: p.url }],
    page_urls: p.url ? [p.url] : [],
    shipping_address: { line1: "1 Demo St", city: "Austin", state: "TX", postal_code: "78701", country: "US" },
    trace_id: "trace_integration_test",
  });
  assert.match(r.order_id, /^ord_/);
  assert.ok(["captured", "pending_approval"].includes(r.status), `unexpected status ${r.status}`);
});

test("unsigned POST /checkout is rejected with 401", async (t) => {
  if (!(await apiUp())) return t.skip("IntentLock API not available");
  const res = await fetch(`${apiUrl()}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 401);
});
