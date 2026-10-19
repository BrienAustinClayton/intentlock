/**
 * Guard rails for live Channel3 calls from the agent (credits are finite):
 * - daily budget per process (CHANNEL3_DAILY_LIMIT, default 500); searches stop at 80% so the product reads that
 *   buying needs keep a reserve. The API keeps its own budget in Postgres (services/intentlock/app/channel3.py).
 * - short in-memory cache (searches 10 min, products 2 min), at most 4 calls in flight,
 * - one retry on 429/5xx/network errors (honours Retry-After up to 5 s), circuit breaker after 5 straight failures,
 * - 15 s timeout, 2 MB response cap, JSON object required.
 */
import { env } from "./config.ts";

export type Channel3Reason = "budget" | "circuit_open" | "failed" | "bad_response" | "invalid_input";

const MESSAGES: Record<Channel3Reason, string> = {
  budget: "Sepilo has used today's product-search allowance. Try again tomorrow.",
  circuit_open: "Product search is unavailable for a moment. Try again in a minute.",
  failed: "Product search didn't respond. Try again in a minute.",
  bad_response: "Product search returned something unexpected. Try again in a minute.",
  invalid_input: "That search can't be run. Try describing the product in a few words.",
};

export class Channel3Unavailable extends Error {
  constructor(public readonly reason: Channel3Reason) {
    super(MESSAGES[reason]);
    this.name = "Channel3Unavailable";
  }
}

export const LIMITS = {
  timeoutMs: 15_000,
  maxBytes: 2_000_000,
  maxInFlight: 4,
  breakerFailures: 5,
  breakerCooldownMs: 60_000,
  browseShare: 0.8,
  cacheEntries: 300,
};

const state = {
  day: "",
  calls: 0,
  failures: 0,
  openUntil: 0,
  inFlight: 0,
  waiters: [] as (() => void)[],
  cache: new Map<string, { at: number; value: unknown }>(),
};

let sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Tests: clear counters/cache and optionally replace the backoff sleep. */
export function resetChannel3Guards(opts: { noSleep?: boolean } = {}): void {
  Object.assign(state, { day: "", calls: 0, failures: 0, openUntil: 0, inFlight: 0, waiters: [] });
  state.cache.clear();
  if (opts.noSleep) sleep = async () => {};
}

export function dailyLimit(): number {
  const n = Number(env("CHANNEL3_DAILY_LIMIT") ?? 500);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 500;
}

function spend(kind: "search" | "product"): void {
  const today = new Date().toISOString().slice(0, 10);
  if (state.day !== today) Object.assign(state, { day: today, calls: 0 });
  const cap = dailyLimit() * (kind === "search" ? LIMITS.browseShare : 1);
  if (state.calls + 1 > cap) throw new Channel3Unavailable("budget"); // refused calls cost nothing
  state.calls += 1;
}

async function acquire(): Promise<void> {
  if (state.inFlight < LIMITS.maxInFlight) {
    state.inFlight += 1;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      state.waiters = state.waiters.filter((w) => w !== go);
      reject(new Channel3Unavailable("failed"));
    }, LIMITS.timeoutMs);
    const go = () => {
      clearTimeout(t);
      state.inFlight += 1;
      resolve();
    };
    state.waiters.push(go);
  });
}

function release(): void {
  state.inFlight -= 1;
  state.waiters.shift()?.();
}

function record(ok: boolean): void {
  if (ok) {
    state.failures = 0;
    return;
  }
  state.failures += 1;
  if (state.failures >= LIMITS.breakerFailures) {
    state.openUntil = Date.now() + LIMITS.breakerCooldownMs;
    state.failures = 0;
  }
}

function cached<T>(key: string, ttlMs: number): T | undefined {
  const hit = state.cache.get(key);
  if (hit && Date.now() - hit.at <= ttlMs) return hit.value as T;
  return undefined;
}

function remember(key: string, value: unknown): void {
  state.cache.delete(key);
  state.cache.set(key, { at: Date.now(), value });
  while (state.cache.size > LIMITS.cacheEntries) state.cache.delete(state.cache.keys().next().value as string);
}

/**
 * One guarded live call. Returns the parsed JSON object, or null for a 404 (a real "not found", not an outage).
 * `call` gets an AbortSignal with the guard's timeout.
 */
export async function guardedJson(
  kind: "search" | "product",
  key: string,
  ttlMs: number,
  call: (signal: AbortSignal) => Promise<Response>,
): Promise<Record<string, unknown> | null> {
  const hit = cached<Record<string, unknown> | null>(key, ttlMs);
  if (hit !== undefined) return hit;
  if (state.openUntil > Date.now()) throw new Channel3Unavailable("circuit_open");
  spend(kind);
  await acquire();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await call(AbortSignal.timeout(LIMITS.timeoutMs));
      } catch {
        if (attempt === 0) {
          await sleep(500);
          continue;
        }
        break;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          const ra = Number(res.headers.get("retry-after") ?? 1);
          await sleep(Math.min(Math.max(Number.isFinite(ra) ? ra : 1, 0), 5) * 1000);
          continue;
        }
        break;
      }
      if (res.status === 404) {
        record(true);
        remember(key, null);
        return null;
      }
      const text = await res.text();
      if (!res.ok || text.length > LIMITS.maxBytes) {
        record(res.ok ? false : true);
        if (!res.ok) throw new Channel3Unavailable("failed");
        throw new Channel3Unavailable("bad_response");
      }
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        record(false);
        throw new Channel3Unavailable("bad_response");
      }
      if (typeof data !== "object" || data === null) {
        record(false);
        throw new Channel3Unavailable("bad_response");
      }
      record(true);
      remember(key, data);
      return data as Record<string, unknown>;
    }
    record(false);
    throw new Channel3Unavailable("failed");
  } finally {
    release();
  }
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/** A search query fit to send: visible characters only, collapsed spaces, 1-120 characters. */
export function cleanQuery(q: unknown): string {
  const s = String(q ?? "").replace(CONTROL, " ").split(/\s+/).filter(Boolean).join(" ");
  if (!s || s.length > 120) throw new Channel3Unavailable("invalid_input");
  return s;
}

export const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function cleanPrice(v: number | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (!Number.isFinite(v) || v < 0 || v > 1_000_000) throw new Channel3Unavailable("invalid_input");
  return Math.round(v * 100) / 100;
}
