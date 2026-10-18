/**
 * Plain Node entry (`pnpm --filter agent start`) and the HTTP trigger used on Astropods too.
 *   POST /run {"intent_id":"int_..."}  -> run the shopping agent for that signed intent
 *   GET  /health
 */
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { env, withEnv } from "./config.ts";
import { RunError, runShopping } from "./run.ts";

function authorized(header: string | undefined): boolean {
  const secret = env("AGENT_RUN_SECRET");
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function startServer(port = Number(env("PORT") ?? 8808), host = env("HOST") ?? "127.0.0.1"): Server {
  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      const path = (req.url ?? "").split("?")[0];
      if (req.method === "GET" && path === "/health") return send(200, { ok: true });
      if (req.method === "POST" && path === "/run") {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const c of req) {
          size += (c as Buffer).length;
          if (size > 10_000) return send(413, { reason: "body too large" });
          chunks.push(c as Buffer);
        }
        let body: { intent_id?: unknown; agent_id?: unknown; agent_private_key?: unknown };
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          return send(400, { reason: "invalid JSON" });
        }
        const intentId = body.intent_id;
        if (typeof intentId !== "string") return send(400, { reason: "intent_id required" });
        if (body.agent_id === undefined && body.agent_private_key === undefined) {
          return send(200, await runShopping(intentId));
        }
        // Hosted run for a user's agent: only the IntentLock API may hand over agent credentials.
        if (!authorized(req.headers.authorization)) return send(401, { reason: "unauthorized" });
        if (typeof body.agent_id !== "string" || !/^agt_[A-Za-z0-9_]{1,60}$/.test(body.agent_id)) {
          return send(400, { reason: "invalid agent_id" });
        }
        if (typeof body.agent_private_key !== "string" || body.agent_private_key.length > 64) {
          return send(400, { reason: "invalid agent_private_key" });
        }
        const creds = { AGENT_ID: body.agent_id, AGENT_PRIVATE_KEY: body.agent_private_key };
        return send(200, await withEnv(creds, () => runShopping(intentId)));
      }
      send(404, { reason: "not found" });
    } catch (e) {
      if (e instanceof RunError) return send(e.status, { reason: e.message });
      console.error("run failed:", (e as Error).message);
      send(500, { reason: "agent run failed" });
    }
  });
  server.listen(port, host, () => console.log(`intentlock agent listening on http://${host}:${port} (POST /run)`));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();
