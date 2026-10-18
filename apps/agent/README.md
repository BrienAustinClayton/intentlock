# IntentLock shopping agent (apps/agent)

A Mastra agent on the Astropods template. Given a signed `intent_id` it reads the request (signed `GET /intents/{id}`, read-only),
searches the catalog, builds a cart, and calls IntentLock `POST /checkout` once, signed per RFC 9421
(`src/signing.ts`, byte-identical to `data/eval/http_sig_vector.json`). The agent never sends request text to `/checkout`
and never sets prices: `checkout` re-reads title and price from the catalog.

Tools (`src/tools.ts`): `search_products`, `get_product`, `read_page`, `build_cart`, `checkout`, `propose_slot`.

## Env (apps/agent/.env, never commit)
`INTENTLOCK_API_URL`, `AGENT_ID` (agt_demo_shopper), `AGENT_PRIVATE_KEY`, `CHANNEL3_API_KEY` (only with `LIVE=1`),
`LLM_FAST_BASE_URL/API_KEY/MODEL` (local Node runs only; Astropods uses the AI Gateway).
Optional: `INTENTLOCK_SIGN_BASE_URL` (the signed `@target-uri` base; must equal the API's `PUBLIC_BASE_URL`, defaults to
`INTENTLOCK_API_URL`), `PORT` (8808), `HOST` (127.0.0.1), `LIVE=1`.

## Path A: plain Node (works anywhere, also a Render worker)
```
pnpm --filter agent start          # POST http://127.0.0.1:8808/run {"intent_id":"int_..."}  (+ GET /health)
pnpm --filter agent test           # signing vector test + integration test (skips if the API is down)
pnpm --filter agent smoke          # cart draft for "Groceries for the week, under $80, from FreshMart"
pnpm --filter agent smoke -- --checkout   # creates an intent for usr_demo_priya, runs the agent, prints order id + decision
pnpm --filter agent register       # checks/registers the agent public key (POST /agents)
```
Before `smoke -- --checkout` free the budget: `cd services/intentlock && uv run python ../../scripts/reset_demo.py`.
The web app calls it through `apps/web` `/api/run-agent` with `AGENT_RUN_URL=http://127.0.0.1:8808/run`.

## Path B: Astropods (Docker, AI Gateway)
```
export PATH="$HOME/.ast/bin:$PATH"; ast login
cd apps/agent
ast project configure --var INTENTLOCK_API_URL=http://host.docker.internal:8000 \
  --var INTENTLOCK_SIGN_BASE_URL=http://localhost:8000 --var AGENT_ID=agt_demo_shopper \
  --var AGENT_PRIVATE_KEY=... --var LIVE=0      # or --vars-file; values are stored in ~/.ast/project-configs.json
ast project start -b                            # chat playground http://localhost:3100, POST /run on http://localhost:3200/run
ast project stop
```
Inside Docker `localhost` is the container, so requests go to `host.docker.internal:8000` while the signature still covers
`http://localhost:8000` (what the API rebuilds from `PUBLIC_BASE_URL`). Locally set `AGENT_RUN_URL=http://localhost:3200/run`.
Deploy: `ast push` then deploy from the Astropods platform (P4-T03); `agent.interfaces.frontend` gives it a public host and the
platform sets `PORT=80`; `AGENT_RUN_URL` is then `https://<host>/run`. Traces: each run passes a 32-hex `trace_id`
(Mastra `tracingOptions.traceId`); it is sent in `/checkout` and returned by `/run`.

## page_urls in local dev
The API only scans public http(s) pages and blocks localhost (SSRF). The catalog has no product page URL, so `checkout`
builds candidates from the catalog offers (`https://<offer merchant domain>/`, or a product `url` if Channel3 provides one),
probes them the way the scanner fetches, and sends up to 2 that answer. `read_page` can read the local store
(`http://localhost:3000/store/...`) but those URLs are never sent to `/checkout`. If no public page answers, `page_urls` is empty,
the scan errors, and IntentLock holds the order (`pending_approval`).

## Layout
`src/` core (config, signing, intentlock client, catalog, tools, agent, run, server) · `agent/index.ts` Astropods entry ·
`scripts/` smoke, register · `astropods.yml`, `Dockerfile` Astropods blueprint.
