# Performance (P4-T08)

Targets: checkout decision p95 < 6 s, Intent Diff p95 < 4 s.

## How it was measured

`uv run --project services/intentlock python scripts/bench_checkout.py [--clear-llm-cache] [--runs N] [--api URL]`

- Target: the LOCAL API (`http://127.0.0.1:8000`, uvicorn `--reload`, local Postgres). No Render deploy existed at
  measurement time. PayPal runs in mock mode, so `authorize_payment` and `capture_or_void` are about 1 ms here;
  real sandbox calls add network latency on top of these numbers.
- Live LLMs: Groq (`openai/gpt-oss-120b`, Prompt Guard) and Jev (System One). Real calls, not stubs.
- The script calls `POST /lab/reset` before every scenario run (otherwise the mandate budget is exhausted and
  later runs are rejected before any AI step, which would hide the real latency), runs the six `/lab` scenarios N times,
  and reads per-step `duration_ms` from `GET /orders/{id}`.
- Cold = first run of each scenario right after emptying `llm_cache` (so the LLM calls are live). Warm = runs 2..N (`llm_cache` hits).
- Also times one real signed `POST /checkout` with `page_urls: ["https://example.com/"]` (remote fetch path).

## Results (ms)

| Metric | Run A: before (3 runs, cold cache) | Run B: after (5 runs, cold cache) |
|---|---|---|
| Decision end-to-end, cold p50 / p95 | 359 / 630 | 372 / 563 |
| Decision end-to-end, warm p50 / p95 | 52 / 67 | 54 / 70 |
| Decision p95 over all runs | 500 | 400 |
| `scan_injection` cold p50 / p95 | 8 / 293 | 12 / 266 |
| `intent_diff` cold p50 / p95 | 284 / 524 | 286 / 438 |
| `intent_diff` p95 over all runs | 360 | 300 |
| `graph_risk` cold p95 | 58 | 79 |
| Real signed `/checkout` (remote fetch of example.com), end-to-end | 129 | 113 |
| Real `/checkout` `scan_injection` step | 81 | 66 |
| Jev spend (cumulative `/llm/usage`) | 0.0018 USD, 56 calls, 0 fallbacks | 0.0020 USD, 61 calls, 0 fallbacks |

Both targets are met by a wide margin (decision p95 about 0.4-0.5 s vs 6 s; Intent Diff p95 about 0.3-0.4 s vs 4 s).
Run A and Run B differ only by noise and sample size: no code was changed, so there is no real "after".
All scenarios returned their expected decision in both runs.

## Why no code changes

Each candidate from the task was checked and found already in place or not worth changing:

- The three AI steps (`scan_injection`, `intent_diff`, `graph_risk`) already run concurrently; inside `scan_injection`
  Jev and the guard model also run in parallel with a per-call timeout.
- Intent Diff only calls Jev when the rules leave an item `uncertain`; otherwise it is rules-only (a few ms).
- The Groq `OpenAI` client and the Jev `TypeSafeClient` are process-level singletons (built once under a lock).
- `llm_cache` already makes repeated lab runs warm: warm end-to-end is about 50-70 ms.
- The remote fetch keeps its 3 s timeout, no redirects, 2 MiB cap and SSRF host checks. Fetch latency is about 65-80 ms
  for example.com; the timeout only matters for slow hosts, and lowering it would weaken nothing but gain nothing measurable here.
- Channel3 is not on the decision path (catalog reads use a local catalog and 24 h `catalog_cache`).

## Caveats for the deployed stack

- Re-run `bench_checkout.py --api https://<render-url>` once Render is live. Expect network RTT, Render cold start,
  and real PayPal sandbox authorize/capture (hundreds of ms each) to dominate.
- Worst-case budget if everything times out: `STEP_TIMEOUT_S` is 8 s per AI step with 1 retry, so a total provider outage
  fails closed (hold or void) but can exceed 6 s. Healthy-path p95 is far below target.
