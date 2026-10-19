import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { channel3Get, channel3Search } from "./catalog.ts";
import { Channel3Unavailable, LIMITS, cleanQuery, resetChannel3Guards } from "./channel3Guard.ts";
import { withEnv } from "./config.ts";

const realFetch = globalThis.fetch;
let calls: string[] = [];
let replies: (() => Response)[] = [];

const product = (id: string) => ({
  id, title: "USB-C cable", category: { path: [{ slug: "electronics" }] },
  offers: [{ domain: "bestbuy.com", price: { price: 9.99, currency: "USD" }, availability: "InStock", url: "https://bestbuy.com/p" }],
});

beforeEach(() => {
  resetChannel3Guards({ noSleep: true });
  calls = [];
  replies = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    const next = replies.shift();
    return next ? next() : new Response(JSON.stringify({ products: [product("p1")] }), { status: 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const run = <T>(fn: () => Promise<T>, extra: Record<string, string> = {}) =>
  withEnv({ CHANNEL3_API_KEY: "k", ...extra }, fn);

test("repeat searches are served from the cache", async () => {
  await run(() => channel3Search("usb cable", 5));
  await run(() => channel3Search("USB  cable", 5));
  assert.equal(calls.length, 1);
});

test("daily budget: searches stop at 80%, product reads keep the reserve", async () => {
  await run(async () => {
    for (let i = 0; i < 4; i++) await channel3Search(`cable ${i}`, 5);
    await assert.rejects(channel3Search("cable 9", 5), (e: Channel3Unavailable) => e.reason === "budget");
    replies.push(() => new Response(JSON.stringify(product("p2")), { status: 200 }));
    assert.equal((await channel3Get("p2"))?.product_id, "p2");
  }, { CHANNEL3_DAILY_LIMIT: "5" });
});

test("retries once on 503, then opens the circuit after repeated failures", async () => {
  replies.push(() => new Response("", { status: 503 }));
  assert.equal((await run(() => channel3Search("hub", 5))).length, 1);
  assert.equal(calls.length, 2);

  for (let i = 0; i < LIMITS.breakerFailures; i++) {
    replies.push(() => new Response("", { status: 500 }), () => new Response("", { status: 500 }));
    await assert.rejects(run(() => channel3Search(`dock ${i}`, 5)), (e: Channel3Unavailable) => e.reason === "failed");
  }
  const before = calls.length;
  await assert.rejects(run(() => channel3Search("dock again", 5)), (e: Channel3Unavailable) => e.reason === "circuit_open");
  assert.equal(calls.length, before);
});

test("bad input and wrong products never get through", async () => {
  assert.throws(() => cleanQuery("x".repeat(200)));
  assert.equal(cleanQuery("usb​\u0007 cable"), "usb cable");
  await assert.rejects(run(() => channel3Search("cable", 5, undefined, { maxPrice: Number.NaN })));
  assert.equal(await run(() => channel3Get("../search")), null);
  assert.equal(calls.length, 0);
  replies.push(() => new Response(JSON.stringify(product("other")), { status: 200 }));
  assert.equal(await run(() => channel3Get("p1")), null);
});

test("oversized or non-JSON responses are rejected", async () => {
  replies.push(() => new Response("x".repeat(LIMITS.maxBytes + 1), { status: 200 }));
  await assert.rejects(run(() => channel3Search("big", 5)), (e: Channel3Unavailable) => e.reason === "bad_response");
  replies.push(() => new Response("<html>", { status: 200 }));
  await assert.rejects(run(() => channel3Search("html", 5)), (e: Channel3Unavailable) => e.reason === "bad_response");
});
