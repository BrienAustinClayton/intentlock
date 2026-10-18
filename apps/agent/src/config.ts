/**
 * Environment access. Values are read at call time (never copied at import) and never logged.
 * Under Node, a local `.env` is loaded if present (Bun and `ast project start` inject env themselves).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

(function loadDotEnv(): void {
  const envPath = resolve(here, "..", ".env");
  if (!existsSync(envPath)) return;
  try {
    // Node >= 20.12. Does not override variables that are already set.
    (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(envPath);
  } catch {
    /* unreadable .env: carry on with the process environment */
  }
})();

// Per-run overrides (a hosted run acting as one user's agent) without touching process.env.
const overrides = new AsyncLocalStorage<Record<string, string>>();

export function withEnv<T>(values: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  return overrides.run(values, fn);
}

export function env(name: string): string | undefined {
  const v = overrides.getStore()?.[name] ?? process.env[name];
  return v === undefined || v === "" || v === "__FILL_ME__" ? undefined : v;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`missing env var ${name}`);
  return v;
}

/** Base URL requests are sent to. */
export const apiUrl = (): string => requireEnv("INTENTLOCK_API_URL").replace(/\/+$/, "");

/**
 * Base URL that gets signed as @target-uri. The API rebuilds it from PUBLIC_BASE_URL, so it must equal that
 * value even when the request is sent to a different host (e.g. 127.0.0.1). Defaults to the send URL.
 */
export const signBaseUrl = (): string =>
  (env("INTENTLOCK_SIGN_BASE_URL") ?? apiUrl()).replace(/\/+$/, "");

export const agentId = (): string => env("AGENT_ID") ?? "agt_demo_shopper";

export const isLive = (): boolean => env("LIVE") === "1";
