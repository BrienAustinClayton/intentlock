import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, test } from "node:test";
import { withEnv } from "./config.ts";
import { ApiError, signedFetch } from "./intentlock.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const privateKey = (): string => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  return der.subarray(der.length - 32).toString("base64url");
};

test("API errors keep the API's reason (top-level {error, reason})", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "rate_limited", reason: "This agent has reached its limit of 100 orders in 24 hours." }), {
      status: 429,
    })) as typeof fetch;
  const env = { INTENTLOCK_API_URL: "http://api.test", INTENTLOCK_SIGN_BASE_URL: "http://api.test", AGENT_ID: "agt_x", AGENT_PRIVATE_KEY: privateKey() };
  await assert.rejects(
    withEnv(env, () => signedFetch("POST", "/checkout", { a: 1 })),
    (e: ApiError) => e.status === 429 && e.reason === "This agent has reached its limit of 100 orders in 24 hours." && /rate_limited/.test(e.message),
  );
});
