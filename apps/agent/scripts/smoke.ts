/**
 * pnpm --filter agent smoke               cart draft for "Groceries for the week, under $80, from FreshMart"
 * pnpm --filter agent smoke -- --checkout  creates an intent for usr_demo_priya, runs the agent, prints order id + decision
 *   (reset the budget first: cd services/intentlock && uv run python ../../scripts/reset_demo.py)
 */
import { agentId, apiUrl } from "../src/config.ts";
import { runDraft, runShopping } from "../src/run.ts";

const DRAFT_TEXT = "Groceries for the week, under $80, from FreshMart";
const CHECKOUT_TEXT = "Toddler milk, fruit pouches and snacks for the week, under $80, from FreshMart";

async function createIntent(text: string): Promise<string> {
  const res = await fetch(`${apiUrl()}/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "usr_demo_priya", agent_id: agentId(), request_text: text }),
  });
  if (!res.ok) throw new Error(`POST /intents -> ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

async function main() {
  if (process.argv.includes("--checkout")) {
    const intentId = await createIntent(CHECKOUT_TEXT);
    console.log(`intent ${intentId}: "${CHECKOUT_TEXT}"`);
    const r = await runShopping(intentId);
    console.log("cart:");
    for (const l of r.cart) console.log(`  ${l.qty} x ${l.title.slice(0, 60)}  ${l.unit_price} ${l.currency}  [${l.product_id}]`);
    console.log(`total: ${r.total}`);
    console.log(`order id: ${r.order_id}`);
    console.log(`status: ${r.status}  decision: ${r.decision}`);
    if (r.reasons.length) console.log(`reasons: ${r.reasons.join(" | ")}`);
    console.log(`trace id: ${r.trace_id}`);
    if (!r.order_id) console.log(`errors: ${r.errors.join(" | ")}\nagent said: ${r.summary.slice(0, 400)}`);
    const ok = r.order_id && (r.status === "captured" || r.status === "pending_approval");
    if (!ok) {
      console.error("SMOKE FAILED: expected captured or pending_approval");
      process.exit(1);
    }
    return;
  }
  const d = await runDraft(DRAFT_TEXT);
  console.log(`request: ${DRAFT_TEXT}`);
  console.log(`cart draft (${d.merchant}):`);
  for (const l of d.cart) console.log(`  ${l.qty} x ${l.title.slice(0, 60)}  ${l.unit_price} ${l.currency}  [${l.category}]`);
  console.log(`total: ${d.total}`);
  console.log(`trace id: ${d.trace_id}`);
  if (d.merchant !== "freshmart" || d.cart.length < 3) {
    console.error("SMOKE FAILED: expected >= 3 FreshMart items");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("SMOKE FAILED:", (e as Error).message);
  process.exit(1);
});
