/**
 * Registers AGENT_PUBLIC_KEY (derived from AGENT_PRIVATE_KEY if unset) via POST /agents, unless the key is already
 * registered for AGENT_ID. Usage: pnpm --filter agent register -- usr_demo_priya
 */
import { agentId, apiUrl, env, requireEnv } from "../src/config.ts";
import { publicKeyB64 } from "../src/signing.ts";

async function main() {
  const userId = process.argv.slice(2).find((a) => a.startsWith("usr_")) ?? "usr_demo_priya";
  const pub = env("AGENT_PUBLIC_KEY") ?? publicKeyB64(requireEnv("AGENT_PRIVATE_KEY"));
  const keys = (await (await fetch(`${apiUrl()}/.well-known/agent-keys`)).json()) as {
    keys: { keyid: string; public_key: string; revoked: boolean }[];
  };
  const have = keys.keys.find((k) => k.keyid === agentId());
  if (have) {
    console.log(`agent ${agentId()} already registered; public key ${have.public_key === pub ? "matches" : "DIFFERS from"} AGENT_PUBLIC_KEY; revoked=${have.revoked}`);
    return;
  }
  const res = await fetch(`${apiUrl()}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, name: "IntentLock Shopper", public_key: pub, device_id: "astropods-agent" }),
  });
  if (!res.ok) throw new Error(`POST /agents -> ${res.status}`);
  const a = (await res.json()) as { id: string };
  console.log(`registered agent ${a.id}. Set AGENT_ID=${a.id} in apps/agent/.env`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
