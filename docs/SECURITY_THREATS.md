# Sepilo threat register: 32 agentic-commerce threats

How Sepilo, a PayPal shopping agent, handles each threat family in *32 Security Threats in Agentic Commerce*, which follows the taxonomy in "Connecting the Dots in Agentic AI Security" (arXiv:2609.23894).

Every row is backed by automated tests. `services/intentlock/tests/redteam/test_threat_register.py` maps all 32 threats to those tests. It fails if a threat loses its test.

## How a purchase is protected

1. **You approve an exact cart.** The approved cart's hash goes into the purchase request, which Sepilo signs with its own Ed25519 key. Checkout must match that cart: same store, products and quantities, and a price can only go down. Each request allows one live order.
2. **Cart check before any money moves.** It runs when you click *Approve and buy*.
   - Code checks block on their own:
     - spending rules;
     - price, store and stock, re-read from Channel3;
     - hidden or AI-directed text in listings.
   - **Jev** answers three judgement questions:
     - Does each item match your request?
     - Is a listing trying to steer an AI?
     - Are the quantities sensible?
   - Jev can only block a cart or ask you to confirm. It can never clear a code failure. If Jev is down or its answer is malformed, Sepilo asks you to confirm instead of passing the cart.
3. **Signed checkout, server-side truth.**
   - Each agent request carries an RFC 9421 signature with a nonce. Replays and tampered bodies are rejected.
   - Price, store, category and page come from Channel3, never from the agent.
4. **Hold, check, then capture.**
   - PayPal holds the money while page scans, intent diff and graph risk run.
   - The final capture, void or hold decision is made by plain code (`app/policy.py`).
   - Every order gets a signed proof record.

## Threat register

| # | Threat | How Sepilo stops it | Where |
|---|---|---|---|
| 1 | Goal hijacking | Listings that talk to an AI are dropped before the model ranks them and before cards are shown. The cart check blocks them. Checkout must equal the approved cart. | `untrusted.py`, `cart_review.py`, `api/checkout.py` |
| 2 | Task-state corruption | The approved cart is bound into the signed request. One order per request. The cart is stored server-side per chat. A run only accepts its own order. | `intents.py`, `api/checkout.py`, `hosted_agents.py` |
| 3 | Constraint bypass | Budget, category and store are enforced in code, using Channel3's category. Spending rules can only be changed by their signed-in owner. | `mandates.py`, `product_truth.py`, `access.py` |
| 4 | Objective drift | No learning and no long-term memory. Each suggestion is filtered by the rules in code. Jev checks that the cart matches the request. | `suggest.ts`, `cart_review.py` |
| 5 | Direct prompt injection | The agent never holds card or PayPal data. It has no email or exfiltration tools. Replies that leak prompts are replaced. | `hosted_agents.py`, `untrusted.py` |
| 6 | Indirect prompt injection | Listing hygiene in both the agent and the API. Pages are scanned with heuristics plus Jev and Prompt Guard. A model can't clear a heuristic flag. | `untrusted.ts`, `checks/injection.py` |
| 7 | Plan manipulation | The store must be one of the product's Channel3 offers. Price is re-read at checkout. Spending rules can limit the stores. | `product_truth.py` |
| 8 | Reflection poisoning | Runs are claimed once and attempts are bounded. The agent can't trigger retries. One order per request. | `hosted_agents.py`, `api/checkout.py` |
| 9 | Cascading hallucination | Specs and prices come only from Channel3. Quantities are capped. The model only picks from an indexed list. Jev checks the match. | `product_truth.py`, `shop.ts` |
| 10 | System-prompt extraction | Chat replies containing prompt fragments or secrets are replaced. Prompts contain no secrets. | `untrusted.py` |
| 11 | Business-rule inference | Users see plain reasons only, never scores, probabilities or thresholds. Metrics are operator-only. Chat is rate limited. | `api/orders.py`, `access.py`, `velocity.py` |
| 12 | Tool-schema disclosure | API docs are off by default. Agent tools are a fixed allow-list. | `main.py`, `tools.ts` |
| 13 | Short-term context poisoning | Chat context is this user's own recent turns only. Product text is never stored as a "preference". | `api/chats.py` |
| 14 | Persistent memory poisoning | The hosted agent keeps no memory. The Astropods agent's memory is in-process only. | `agent/index.ts`, `server.ts` |
| 15 | RAG knowledge poisoning | There is no user-writable knowledge store. Product facts are read live from Channel3 at checkout. | `product_truth.py` |
| 16 | Cross-session memory leakage | Every user route checks ownership. Proofs are owner-only. Old open routes are closed. | `api/me.py`, `api/proofs.py` |
| 17 | Shared-memory contamination | No shared blackboard. Agents can't write catalog, rules or schedules. | `access.py` |
| 18 | Unauthorized tool invocation | Capture, void and approve happen only in code or by the signed-in owner. Large approvals need the total typed back. | `api/approvals.py`, `velocity.py` |
| 19 | Tool abuse / scope expansion | A route test fails on any route that answers without credentials. An agent's signature reaches only its own requests. Lab reset only touches demo orders. The agent's page fetch is SSRF-guarded. | `test_route_access.py`, `safeFetch.ts` |
| 20 | Malicious tool/plugin | No third-party plugins or MCP in the agent. The tool list is pinned by a test. | `tools.ts` |
| 21 | Tool-response poisoning | Channel3 and agent responses are checked against schemas and the database. Run summaries are built from the order. | `product_truth.py`, `hosted_agents.py` |
| 22 | Unexpected code execution | No eval, exec, pickle or shell anywhere in the API, enforced by a source test. | `test_source_guards.py` |
| 23 | Payment-action abuse | The payee is fixed to Sepilo's PayPal app. Rate limits per user and agent. One order per request. Signed requests can't be replayed. | `velocity.py`, `paypal/` |
| 24 | Human approval fatigue | At most 5 pending approvals per agent; extra holds are voided. Waiting approvals show biggest first. Orders of $100 or more need the total typed. | `pipeline/core.py`, `velocity.py` |
| 25 | Deceptive agent behavior | What you read comes from the order, not from the agent. Every order has a signed, tamper-evident proof. | `hosted_agents.py`, `proof/` |
| 26 | User impersonation | Changing the payment method needs a sign-in from the last 15 minutes. Email notices go out for new agents and PayPal changes. | `velocity.py`, `auth.py` |
| 27 | Agent impersonation | Per-agent Ed25519 keys, RFC 9421 signatures and nonces. Hosted keys are sealed. The API and the agent share a secret. Lab test keys are refused at checkout. | `crypto/http_sig.py`, `server.ts` |
| 28 | Unauthorized delegation | Agents can't create agents, keys or rules. Hosted keys are sealed per agent. | `access.py`, `hosted_agents.py` |
| 29 | Inter-agent message poisoning | API-to-agent payloads are built from the database. The agent's reply is treated as data and checked against the order. | `hosted_agents.py` |
| 30 | Byzantine/collusive agents | One deterministic decider. Jev is a single advisor that can only escalate. There is no vote to rig. | `policy.py`, `cart_review.py` |
| 31 | Environment/content injection | Page scans fail closed on hostile or unreachable pages. Listing and cart text is scanned. | `checks/`, `untrusted.py` |
| 32 | Web/browser manipulation | The agent never drives a browser or fills in checkout pages. Payment goes through the PayPal API. Page reads are public-only with redirect re-checks. | `tools.ts`, `safeFetch.ts` |

## Running the checks

```
cd services/intentlock && uv run pytest tests/redteam tests/security tests/test_cart_review.py
cd apps/agent && npm test
```
