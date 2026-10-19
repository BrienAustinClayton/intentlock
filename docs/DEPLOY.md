# Deploying IntentLock to Render

This guide walks through deploying IntentLock using the `render.yaml` Blueprint.  
Time required: ~30 minutes on first deploy.

---

## Prerequisites

- A [Render account](https://render.com) (free tier works; claim hackathon credits if available).
- This GitHub repo connected to your Render account (or forked under your own org).
- Credentials ready (see `.claude/skills/setup-credentials/scripts/creds.py` for where to get each value):
  - Groq API key (`LLM_FAST_API_KEY`)
  - TypeSafe/Jev API key (`LLM_SMART_API_KEY`)
  - Channel3 API key (`CHANNEL3_API_KEY`)
  - Generated Ed25519 keys: run `python .claude/skills/setup-credentials/scripts/creds.py genkeys`
    and copy the values for `INTENTLOCK_PROOF_PRIVATE_KEY`, `INTENTLOCK_PROOF_PUBLIC_KEY`,
    `INTENTLOCK_WALLET_PRIVATE_KEY`, and `AGENT_PRIVATE_KEY`.
  - PayPal sandbox credentials (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`): `PAYPAL_MODE=sandbox` makes real
    PayPal Sandbox payments (see "PayPal payments" below). Set `PAYPAL_MODE=mock` to skip PayPal entirely.

---

## Step 1 — Connect your repo to Render

1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New** in the top-right corner.
3. Select **Blueprint**.
4. Click **Connect a repository** and authorise the GitHub app for your repo.
5. Select the repo `knowledge-graph` (or your fork).
6. Render detects `render.yaml` automatically. Click **Apply**.

---

## Step 2 — Fill in secrets during Blueprint creation

Render pauses on any env var marked `sync: false` and asks you to supply values.
Paste the values below (names only; never paste values anywhere else).

### intentlock-api

| Var | Where to get the value |
|---|---|
| `PUBLIC_BASE_URL` | Leave **blank for now** — you'll set it after the first deploy (Step 4). |
| `WEB_ORIGIN` | Leave **blank for now** — you'll set it after the first deploy (Step 4). |
| `PAYPAL_CLIENT_ID` | PayPal developer dashboard › Apps & Credentials › your sandbox app › Client ID. |
| `PAYPAL_CLIENT_SECRET` | Same page › Secret key 1 › Show. Required when `PAYPAL_MODE=sandbox`. |
| `PAYPAL_WEBHOOK_ID` | Same app › Webhooks › Add webhook to `<API URL>/webhooks/paypal` → copy Webhook ID. (Optional.) |
| `LLM_FAST_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) (free). |
| `LLM_SMART_API_KEY` | [console.typesafe.ai](https://console.typesafe.ai) › API Keys ($5 credit). |
| `CHANNEL3_API_KEY` | [trychannel3.com/developers](https://trychannel3.com/developers) — use promo `PAYPAL-HACKATHON-2026`. |
| `RENDER_API_KEY` | Render dashboard › Account Settings › API Keys. (Optional: only needed for Render Workflows.) |
| `NEO4J_URI` | AuraDB Free › instance › Connection URI. (Optional: graph uses in-memory NetworkX by default.) |
| `NEO4J_PASSWORD` | Shown once when AuraDB instance is created. (Optional.) |
| `INTENTLOCK_PROOF_PRIVATE_KEY` | Run `creds.py genkeys` → copy value. |
| `INTENTLOCK_PROOF_PUBLIC_KEY` | Same run → copy value. |
| `INTENTLOCK_WALLET_PRIVATE_KEY` | Same run → copy value. |

### intentlock-web

| Var | Where to get the value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Leave **blank for now** — set after first deploy (Step 4). **Important:** this is baked into the browser bundle at build time; a redeploy is needed after you set it. |
| `AGENT_RUN_URL` | Leave **blank for now** — set after first deploy (Step 4). |
| `LLM_FAST_API_KEY` | Same Groq key as the API. |

### intentlock-agent

| Var | Where to get the value |
|---|---|
| `INTENTLOCK_API_URL` | Leave **blank for now** — set after first deploy (Step 4). |
| `INTENTLOCK_SIGN_BASE_URL` | Leave **blank for now** — same value as `INTENTLOCK_API_URL` (Step 4). |
| `AGENT_PRIVATE_KEY` | Run `creds.py genkeys` → copy value. |
| `CHANNEL3_API_KEY` | Same Channel3 key as the API. |
| `LLM_FAST_API_KEY` | Same Groq key as the API. |

Click **Apply** to start the initial deploy.

---

## Step 3 — Wait for services to become healthy

Render builds and deploys all three services plus the Postgres database.  
Expected build times:

- `intentlock-db` → ~1 min (provisioning)
- `intentlock-api` → ~3–5 min (`pip install uv && uv sync` + migrations + seeds)
- `intentlock-web` → ~3–5 min (`pnpm install + next build`)
- `intentlock-agent` → ~2 min (`pnpm install`)

Watch the **Logs** tab for each service. A healthy API looks like:

```
INFO:     Application startup complete.
```

The API health endpoint `/health` returns `{"ok":true,"version":"..."}`.

---

## Step 4 — Set the public URL env vars (post-deploy)

Because Render Blueprint can only reference internal hostnames (not full public HTTPS URLs), you must set these after the first deploy:

1. In the Render dashboard, go to each service's **Settings** → **Environment**.
2. Copy the public URL from the service's dashboard page (format: `https://<name>.onrender.com`).

### Values to set

| Service | Var | Value |
|---|---|---|
| `intentlock-api` | `PUBLIC_BASE_URL` | `https://intentlock-api.onrender.com` (your API's external URL, **no trailing slash**) |
| `intentlock-api` | `WEB_ORIGIN` | `https://intentlock-web.onrender.com` (your web's external URL) |
| `intentlock-web` | `NEXT_PUBLIC_API_URL` | `https://intentlock-api.onrender.com` |
| `intentlock-web` | `AGENT_RUN_URL` | `https://intentlock-agent.onrender.com/run` |
| `intentlock-agent` | `INTENTLOCK_API_URL` | `https://intentlock-api.onrender.com` |
| `intentlock-agent` | `INTENTLOCK_SIGN_BASE_URL` | `https://intentlock-api.onrender.com` (must equal `PUBLIC_BASE_URL` **byte-for-byte**) |

> **Critical:** `INTENTLOCK_SIGN_BASE_URL` on the agent and `PUBLIC_BASE_URL` on the API must be
> exactly the same string (same scheme, same host, **no trailing slash**). The server reconstructs
> `@target-uri` from `PUBLIC_BASE_URL`; any mismatch causes every agent request to fail with
> `bad_signature`.

3. After saving, **manually trigger a redeploy** of each service (the `NEXT_PUBLIC_API_URL` change needs a full rebuild of `intentlock-web` because Next.js bakes public vars into the bundle at build time).

---

## Step 4b — User sign-in (Google + email codes)

Users sign in with Google or a 6-digit code sent by email (Resend). New users then fill in their details and a short onboarding; returning users go straight to the app.

| Service | Variable | Value |
|---|---|---|
| intentlock-api | `AUTH_SECRET` | Generated by the Blueprint. If the service was created by hand, set any long random string. |
| intentlock-api | `RESEND_API_KEY` | resend.com → API Keys → Create (Sending access) |
| intentlock-api | `RESEND_FROM` | `IntentLock <onboarding@resend.dev>` for testing; `login@<your domain>` once the domain is verified in Resend |
| intentlock-api | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth client ID → Web application |
| intentlock-api | `WEB_ORIGIN` | `https://intentlock-web.onrender.com` |
| intentlock-web | `APP_URL` | `https://intentlock-web.onrender.com` (same value as `WEB_ORIGIN`) |

Google OAuth client → **Authorized redirect URIs**:

```
http://localhost:3000/api/auth/google/callback
https://intentlock-web.onrender.com/api/auth/google/callback
```

Resend without a verified domain only delivers to the email address that owns the Resend account. Verify a domain (Resend → Domains) before inviting other users.

Locally, if `RESEND_API_KEY` is unset and `WEB_ORIGIN` is localhost, the API prints the code to its log instead of sending an email.

How it works: the API stores users, an HMAC of each code (10-minute expiry, 5 attempts, 30-second resend cooldown) and a SHA-256 of each session token (30 days). The web app keeps the session token in an httpOnly cookie on its own domain and forwards it to the API; `src/proxy.ts` sends signed-out visitors to `/login` and unfinished sign-ups to `/signup` or `/onboarding`. `/store/*` and `/proof/*` stay public.

## Step 4c — Hosted shopping agents

Users can create an agent that IntentLock runs for them (Agents → Create agent). The API keeps that agent's private key sealed with AES-GCM (key derived from `AUTH_SECRET`) and, for each purchase request, calls the agent service with the agent's credentials. The outcome (order placed, or why it failed) is stored in `agent_runs` and shown on Purchase requests.

| Service | Variable | Value |
|---|---|---|
| intentlock-api | `AGENT_SERVICE_URL` | `https://intentlock-agent.onrender.com` |
| intentlock-api | `AGENT_RUN_SECRET` | Generated by the Blueprint, or any long random string |
| intentlock-agent | `AGENT_RUN_SECRET` | The same value as on the API |

Changing `AUTH_SECRET` makes existing hosted agents unusable (their keys can no longer be unsealed); users would create a new agent.

### Tracing a purchase request (developers)

The API and the agent service each print one JSON line per step, tagged with the same `run_id` (sent to the agent in the `X-IntentLock-Run` header). Search both services' logs on Render for the run id:

| Service | Events |
|---|---|
| intentlock-api | `agent_run.queued` → `agent_run.dispatch` (endpoint, attempt) → `agent_run.finished` (status, response_status, response_ms, summary); `agent_run.recovered` when the watchdog resends |
| intentlock-agent | `run.received` → `run.finished` (ms, order_id, decision) or `run.error` / `run.rejected` |

The same data is kept on the `agent_runs` row (`endpoint`, `dispatched_at`, `response_status`, `response_ms`, `response_excerpt`, `attempts`). It is not shown to users.

A watchdog in the API resends runs that were saved but never sent (for example the API restarted right after the request) and fails runs the agent never answered.

## Step 4d — Custom domains

| Service | Domain | DNS record |
|---|---|---|
| intentlock-web | `sepilo.space` | `A` `@` → `216.24.57.1` (or ALIAS/ANAME/flattened CNAME → `intentlock-web.onrender.com`) |
| intentlock-web | `www.sepilo.space` | `CNAME` `www` → `intentlock-web.onrender.com` |
| intentlock-api | `api.sepilo.space` | `CNAME` `api` → `intentlock-api-9eo1.onrender.com` |

The agent keeps its Render URL, `https://intentlock-agent.onrender.com` (no custom domain).

Add each domain under the service's **Settings → Custom Domains**, create the DNS records, then **Verify**; Render issues TLS certificates automatically. Remove any `AAAA` records on these names.

Then point every service at the new URLs (no trailing slashes):

| Service | Variable | Value |
|---|---|---|
| intentlock-api | `PUBLIC_BASE_URL` | `https://api.sepilo.space` |
| intentlock-api | `WEB_ORIGIN` | `https://sepilo.space,https://www.sepilo.space` (comma-separated; the first is the canonical web URL) |
| intentlock-api | `AGENT_SERVICE_URL` | `https://intentlock-agent.onrender.com` |
| intentlock-web | `APP_URL` | `https://sepilo.space` |
| intentlock-web | `NEXT_PUBLIC_API_URL` | `https://api.sepilo.space` (build time: redeploy web after changing) |
| intentlock-web | `AGENT_RUN_URL` | `https://intentlock-agent.onrender.com/run` |
| intentlock-agent | `INTENTLOCK_API_URL` | `https://api.sepilo.space` |
| intentlock-agent | `INTENTLOCK_SIGN_BASE_URL` | `https://api.sepilo.space` (must equal the API's `PUBLIC_BASE_URL`) |

Google OAuth client: add `https://sepilo.space` to Authorized JavaScript origins and `https://sepilo.space/api/auth/google/callback` to Authorized redirect URIs.

## Step 5 — Verify the deployment

```bash
# API health
curl -fsS https://intentlock-api.onrender.com/health
# Expected: {"ok":true,"version":"..."}

# Lab endpoint (checks seeds loaded)
curl -fsS https://intentlock-api.onrender.com/catalog?merchant=freshmart | head -c 200

# Web (loads the home page)
curl -fsSI https://intentlock-web.onrender.com/
```

In the browser:
1. Open `https://intentlock-web.onrender.com/lab`.
2. Click **Run all** — all six lab scenarios should complete.
3. Each scenario shows its expected vs actual decision.

---

## Skipped components

| Component | Why skipped |
|---|---|
| Cron job for approval expiry | The API runs `app.jobs.expire_approvals.run_loop` as a FastAPI lifespan background task — no separate cron service needed. |
| Render Workflows | `PIPELINE_MODE=local` routes all AI pipeline steps (injection scan, intent diff, graph risk) in-process inside the API. Render Workflows are only needed when scaling horizontally. Add them back when `PIPELINE_MODE=render` and `RENDER_WORKFLOW_SLUG` are set. |

---

## Troubleshooting

### API fails to start: `KeyError: 'DATABASE_URL'`

The Render Postgres DB is still provisioning or the Blueprint did not wire the `fromDatabase` var.  
Go to `intentlock-api` → Environment → check that `DATABASE_URL` has a value.  
If it shows `sync: false`, set it manually: Render dashboard → `intentlock-db` → Connect → External URL,  
then prefix the scheme as `postgresql+psycopg://` (replacing `postgres://`).

### `bad_signature` on every agent checkout

`PUBLIC_BASE_URL` on the API and `INTENTLOCK_SIGN_BASE_URL` on the agent are not identical.  
Both must be `https://intentlock-api.onrender.com` with no trailing slash.

### Web shows old API URL / CORS errors

`NEXT_PUBLIC_API_URL` is baked into the JS bundle at build time. After changing it, you must  
**manually redeploy** `intentlock-web` (not just restart) for the change to take effect.

### Lab pages show 500 / `ENOENT data/lab/pages/manifest.json`

The standalone Next.js server reads `../../data/lab/pages/manifest.json` relative to `process.cwd()`  
(which is `apps/web`). Render deploys the full repository, so the path resolves correctly.  
If you see this error, check that `rootDir: apps/web` is set in `render.yaml` for `intentlock-web`  
and that the service was deployed from the blueprint (not as a Docker service).

### Standalone server.js not found: `Cannot find module .next/standalone/apps/web/server.js`

In some pnpm + Next.js monorepo configurations, the standalone output is written to  
`.next/standalone/apps/web/server.js` instead of `.next/standalone/apps/web/server.js`.  
If that happens:
1. Open `apps/web/next.config.ts` and add:
   ```ts
   experimental: { outputFileTracingRoot: path.join(__dirname, "../../") }
   ```
   (also `import path from "path"` at the top).
2. Change `startCommand` in `render.yaml` to `node .next/standalone/apps/web/server.js`.
3. Redeploy.

### Free plan spin-down (cold starts)

Render's free plan spins services down after 15 minutes of inactivity.  
The first request after a cold start takes ~30 seconds.  
For the demo, open the health URL a minute before the presentation.  
Upgrading to the Starter plan ($7/month) disables spin-down.


## PayPal payments (sandbox)

With `PAYPAL_MODE=sandbox` every order is a real PayPal Sandbox payment, visible in the sandbox
Business account (developer.paypal.com › Sandbox accounts › the Business account › log in at
sandbox.paypal.com › Activity).

1. **First purchase.** The user has no saved PayPal yet, so the order waits as "Pay in PayPal". The
   user clicks **Pay with PayPal**, logs in with the sandbox **Personal** account and approves. PayPal sends
   them to `<PUBLIC_BASE_URL>/paypal/return`, the API authorizes the payment (money on hold), runs the
   checks, then captures it or releases it. PayPal also saves the account for later.
2. **Later purchases.** The agent pays with the saved PayPal account on its own: authorize, check,
   capture, with no PayPal page. If PayPal refuses the saved account, the order falls back to step 1.
3. Unapproved payments are dropped after 3 hours and stop counting against the spending rule.

Needs: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` from a sandbox app linked to a **US Business** account
with Vault enabled, a **US Personal** sandbox account to pay with, and `PUBLIC_BASE_URL` set to the API URL.


## Access to the API

Every route needs a signed-in user (`/me/*`), an agent signature (`/checkout`, the agent's `GET /intents/{id}`
and `/schedule/propose`), or the operator key. Operator-only routes (the older `/mandates`, `/orders`,
`/intents`, `/lab`, `/graph`, `/console`, `/llm` …) need the header `X-Admin-Key: <ADMIN_API_KEY>`; Render
generates `ADMIN_API_KEY`, and with it unset those routes stay closed. Public on purpose: `/health`, sign-in,
the PayPal return URLs, `/.well-known/agent-keys`, `/catalog`, `POST /proofs/verify`. Proofs are visible to the
order's owner (and for the attack lab's demo orders). `/docs` and `/openapi.json` are off unless `API_DOCS=1`.
`tests/security/test_route_access.py` fails if a new route is reachable without credentials.


## Channel3 credit guard rails

Channel3 credits are finite, so every live call is guarded, in the API (`app/channel3.py`) and in the agent
(`apps/agent/src/channel3Guard.ts`):

| Guard | API | Agent |
|---|---|---|
| Daily budget (UTC day) | `CHANNEL3_DAILY_LIMIT`, default 300, counted in Postgres (`channel3_usage`) | `CHANNEL3_DAILY_LIMIT`, default 500, per process |
| Reserve for buying | searches stop at 80% of the budget; price checks can use 100% | same |
| Cache | searches 24 h (older copy served if Channel3 is down); price checks 2 min | searches 10 min, products 2 min |
| Retry | once on 429/5xx/timeouts, honouring `Retry-After` (max 5 s) | same |
| Circuit breaker | 5 straight failures: fail fast for 60 s | same |
| Limits | 15 s timeout, 2 MB response, query ≤ 200 chars, product id `[A-Za-z0-9_-]{1,64}` | 15 s, 2 MB, query ≤ 120 chars, 4 calls in flight |
| Response checks | must be a JSON object; a product read must return the requested id | same |

The defaults (300 + 500 a day) spend about 800 credits a day, which lasts 20,000 credits about 25 days.
Refused calls (over budget, circuit open, bad input) don't use credits. Users see a plain message
("Sepilo has used today's product-search allowance…"). Usage per day: `SELECT * FROM channel3_usage`.


## Abuse limits (intentlock-api)

Change any of these on the running API with an env var of the same name (no deploy needed beyond the restart):

| Variable | Default | Limits |
|---|---|---|
| `AGENT_ORDERS_PER_DAY` | 100 | orders one agent may create in 24 h (failed and rejected orders don't count) |
| `CART_CHECKOUTS_PER_HOUR` | 20 | carts a user may approve per hour |
| `CHAT_MESSAGES_PER_MINUTE` | 12 | chat messages per user per minute |

Over a limit the API answers 429 with a plain reason, which the chat shows.
