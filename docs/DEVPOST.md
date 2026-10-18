# IntentLock — Devpost Submission

## Inspiration

AI shopping agents are fast and convenient — but they inherit every weakness of
autonomous systems: they can be manipulated by malicious data in the page they are
reading, they can exceed user intent, and they can silently swap products or variants.
Spending limits and merchant allow-lists are necessary but they say nothing about
*meaning*. We asked: what if every autonomous checkout had to prove — verifiably — that
it matched what the user actually asked for, checked against the exact page the agent
was buying from?

That question became IntentLock.

## What It Does

IntentLock is a **semantic purchase verification layer** that sits between an AI agent
and the PayPal payment API.

When an agent submits a checkout, IntentLock runs a 9-step pipeline:

1. **Verify the agent** — RFC 9421 Ed25519 HTTP signature, nonce, freshness window.
   A replayed or tampered request is rejected before any payment is touched.
2. **Check the mandate** — The user's signed spending mandate (merchant allow-list,
   category, budget, validity window) is verified. The mandate itself is Ed25519-signed
   on creation and re-verified on every checkout; a tampered mandate row is rejected.
3. **Authorise payment** — PayPal AUTHORIZE holds the funds without capturing.
4. **Scan for injection** — The merchant page HTML is scanned for prompt-injection
   attempts: hidden CSS, aria-hidden, zero-font, white-on-white, HTML comments. Three
   signals are combined (heuristic rules + Jev decision model + llama-prompt-guard-2-86m).
   Confidence >= 0.80 voids the payment.
5. **Intent Diff** — Jev classifies each cart line against the user's signed request text:
   is this item explained by what the user asked for? An unexplained line holds the order.
6. **Graph risk** — A NetworkX fraud graph checks for shared signing keys across agents,
   bot-farm order patterns, unfamiliar devices, out-of-mandate orders, and flagged
   merchants. Score >= 60 voids the payment.
7. **Decide** — Code policy (`app/policy.py`) applies first-match rules with fail-safe:
   a missing or malformed check becomes a hold, never a capture.
8. **Capture or void** — PayPal capture or void based on the decision.
9. **Issue a Proof of Intent** — A canonical JSON bundle containing every check, the
   mandate, the intent, and the cart is signed with Ed25519 and stored. Anyone can
   verify it with the public key.

A **30-minute approval hold** lets the user accept or decline edge cases from the wallet
screen. Silence voids the payment.

The Attack Lab (`/lab`) runs six repeatable scenarios end-to-end: normal, hidden gift
card (injection), wrong variant (intent diff), overpriced merchant (price anomaly), bot
farm (graph), and revoked agent. All six match expected decisions in CI.

## How We Built It

**Backend:** FastAPI 0.115, SQLAlchemy 2, Alembic, Python 3.12, `uv` for deps.
The 9-step pipeline runs locally via `pipeline/runner.py`. A Render Workflows entrypoint
(`workflows/intentlock_checks.py`) is written for production but not yet deployed.

**Crypto:** All keys are Ed25519, stored as base64url raw 32-byte values. RFC 9421 HTTP
Message Signatures are implemented from the spec in `app/crypto/http_sig.py` and
validated against test vectors from RFC 9421 Appendix B.2.6. Canonical JSON follows
RFC 8785 rules (sort keys, no extra whitespace).

**LLMs (no Anthropic API in the product):**

- **Jev** (TypeSafe System One) — a decision model, not a chat model. Takes structured
  state + typed questions and returns probabilities (noul yes/no, score levels, choice
  over options). Used for Intent Diff per-line classification, injection detection, and
  graph question routing. Budget guard: every call is logged; when the remaining budget
  falls below the reserve threshold, Jev steps fall back to Groq. Lab reruns hit cache
  and cost nothing. ~0.3 s per call, ~$0.00002/call.
- **Groq** (`openai/gpt-oss-120b`, free tier) — text generation for graph answers and
  the Risk Analyst API. `llama-prompt-guard-2-86m` as a dedicated injection classifier.
- **Decisions are always code.** LLM and Jev outputs only set boolean flags;
  `app/policy.py` makes every capture/hold/void/reject call.

**Data:** Live Channel3 API (search, products, offers) with a 1-hour Postgres cache.
Three merchants (~140+ products). Price anomaly detection compares cart unit prices
against Channel3 offer prices.

**Frontend:** Next.js 14 App Router (TypeScript). Store, wallet, orders, approval
screen, Attack Lab, and Proof of Intent page are all built and working.

**Tests:** Approximately 800 passing tests. The 57-test end-to-end security suite
(`tests/security/test_security_e2e.py`) drives the real HTTP surface with mocked
PayPal and Jev, covering replay attacks, signature tampering, injection bypass, LLM
manipulation, CORS, SSRF, and proof tamper.

**APIMatic Context Plugin:** The PayPal Vault, Orders v2, and webhook integration is
being written with the APIMatic Context Plugin in Claude Code, which surfaces PayPal
API schemas and flows in-editor. This integration is in progress; the service currently
runs in `PAYPAL_MODE=mock`.

## Challenges

- Keeping the decision policy strictly in code while still using LLMs for signal
  generation required careful boundary design. The fail-safe rule (missing or malformed
  check becomes hold, never capture) took multiple iterations to make robust against
  every possible form of malformed LLM output — including NaN, infinity, out-of-range
  values, wrong types, and hostile subclasses of dict.
- RFC 9421 has no production-ready Python implementation. We built `app/crypto/http_sig.py`
  from the spec and validated it against the official test vectors.
- Prompt-injection detection is genuinely difficult. The Attack Lab attack pages use
  CSS `display:none`, `color: #fff` on white background, `aria-hidden`, zero-font-size,
  and HTML comment injection. The three-signal combination — heuristics, Jev noul, and
  the guard model — handles all six scenarios correctly.
- Channel3's grocery category contains toddler food products, not adult groceries.
  We adapted the demo user persona and mandate categories to match what is actually
  available.
- The LLM output boundary: Jev returns probabilities and the system maps them to
  yes/no/uncertain via thresholds in code. An adversary who compromises Jev output
  cannot cause a capture: the heuristic injection scanner, the mandate check, and the
  fail-safe rules all run independently.

## Accomplishments We Are Proud Of

- 6/6 Attack Lab scenarios match expected decisions in CI, including the tricky
  "hidden gift card" case where injection (void) must beat a clean intent diff.
- 57-test security suite that reads like a threat model: every claim has a test name.
- Intent Diff eval: 30/30 on the eval set using rules + Jev, zero false positives on
  normal orders.
- The Proof of Intent: a verifiable, tamper-evident record of every security check,
  mandate, intent, and cart line for every order — verifiable by anyone with the
  public key.
- RFC 9421 from scratch, validated against official test vectors.

## What We Learned

- LLM outputs as signals (not decisions) is a clean architecture that degrades
  gracefully: Jev down → Groq fallback → rules only → uncertain → hold. No single
  failure causes a bad capture.
- A budget guard with a cache (keyed by sha256 of state + questions) makes the LLM
  cost predictable and near-zero for repeated scenarios.
- The APIMatic Context Plugin meaningfully accelerated the PayPal API integration by
  surfacing the right request schemas and example flows without leaving the editor.
- Building the fail-safe policy before the LLMs made testing much easier: the AI checks
  are optional enhancements on top of a working, tested policy engine.

## What's Next

The following are planned for completion before the submission deadline:

- **Real PayPal Sandbox** — APIMatic-assisted integration in progress
  (`app/paypal/sandbox.py`). Vault setup, Orders v2 AUTHORIZE/capture/void, and
  webhook verification.
- **Render deploy** — The Workflows entrypoint is written; deploy and webhook wiring
  remain.
- **Astropods agent** — The Mastra project in `apps/agent/` with trace IDs recorded
  in the Proof of Intent bundle.
- **Bryntum Scheduler** — Mandate timeline UI; backend CrudManager endpoints are done.
- **AG Studio Trust Console** — Risk Analyst and decision metrics dashboard; the API
  is done.
- **Neo4j AuraDB** — Production fraud graph replacing NetworkX, same `GraphStore`
  interface.

## Built With

- PayPal Orders v2 API (AUTHORIZE / capture / void) — mock; Sandbox integration in progress
- APIMatic Context Plugin (PayPal API integration, in progress)
- Channel3 (live product catalog, search, offers, price anomaly detection)
- Jev / TypeSafe System One (decision model for Intent Diff, injection, question routing)
- Groq (gpt-oss-120b for text; llama-prompt-guard-2-86m for injection classification)
- FastAPI 0.115 + SQLAlchemy 2 + Alembic
- Next.js 14 App Router (TypeScript)
- NetworkX (fraud graph; Neo4j AuraDB planned)
- RFC 9421 HTTP Message Signatures (implemented from spec)
- Ed25519 (Python `cryptography` library)
- PostgreSQL
- Render Workflows (entrypoint written, deploy planned)
- Astropods / Mastra (planned)
- Bryntum Scheduler (backend done, UI planned)
- AG Studio (API done, console planned)
- Python 3.12, `uv`
- pnpm workspaces
