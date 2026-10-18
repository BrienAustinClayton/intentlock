/** IntentLock API client. Every call is RFC 9421 signed with the agent key. */
import { agentId, apiUrl, requireEnv, signBaseUrl } from "./config.ts";
import { canonicalJson, signRequest } from "./signing.ts";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    msg: string,
  ) {
    super(msg);
  }
}

export async function signedFetch<T = unknown>(
  method: "GET" | "POST",
  path: string,
  json?: unknown,
): Promise<T> {
  const body = json === undefined ? Buffer.alloc(0) : Buffer.from(canonicalJson(json), "utf8");
  // @target-uri is the PUBLIC base (what the API rebuilds from PUBLIC_BASE_URL) + path.
  const h = signRequest({
    method,
    targetUri: `${signBaseUrl()}${path}`,
    body,
    privateKeyB64: requireEnv("AGENT_PRIVATE_KEY"),
    keyid: agentId(),
  });
  const { signatureBase: _unused, ...headers } = h;
  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : body,
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const d = (parsed as { detail?: { reason?: string; error?: string } } | null)?.detail;
    throw new ApiError(res.status, parsed, `${method} ${path} -> ${res.status} ${d?.error ?? ""} ${d?.reason ?? ""}`.trim());
  }
  return parsed as T;
}

export async function publicGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new ApiError(res.status, await res.text(), `GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export interface Intent {
  id: string;
  user_id: string;
  agent_id: string;
  request_text: string;
  signed_at: string;
  signature: string;
}

/** Read-only. The agent can never change an intent. */
export const getIntent = (id: string): Promise<Intent> =>
  signedFetch<Intent>("GET", `/intents/${encodeURIComponent(id)}`);
