/**
 * Plain Node entry (`pnpm --filter agent start`) and the HTTP trigger used on Astropods too.
 *   POST /run {"intent_id":"int_..."}  -> run the shopping agent for that signed intent
 *   GET  /health
 */
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { env, withEnv } from "./config.ts";
import { emit } from "./log.ts";
import { RunError, runShopping, type RunResult } from "./run.ts";

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
    const runId = typeof req.headers["x-intentlock-run"] === "string" ? req.headers["x-intentlock-run"].slice(0, 64) : undefined;
    let intentId: unknown;
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
        intentId = body.intent_id;
        const hosted = body.agent_id !== undefined || body.agent_private_key !== undefined;
        emit("run.received", { run_id: runId, intent_id: intentId, agent_id: body.agent_id, hosted });
        if (typeof intentId !== "string") return send(400, { reason: "intent_id required" });
        const id = intentId;
        const t0 = Date.now();
        const finish = (r: RunResult) => {
          emit("run.finished", {
            run_id: runId, intent_id: id, ms: Date.now() - t0, order_id: r.order_id,
            status: r.status, decision: r.decision, outcome: r.order_id ? "ordered" : "no_order", summary: r.summary?.slice(0, 200),
          });
          return send(200, r);
        };
        if (!hosted) return finish(await runShopping(id));
        // Hosted run for a user's agent: only the IntentLock API may hand over agent credentials.
        if (!authorized(req.headers.authorization)) {
          emit("run.rejected", { run_id: runId, intent_id: intentId, reason: "unauthorized" });
          return send(401, { reason: "unauthorized" });
        }
        if (typeof body.agent_id !== "string" || !/^agt_[A-Za-z0-9_]{1,60}$/.test(body.agent_id)) {
          return send(400, { reason: "invalid agent_id" });
        }
        if (typeof body.agent_private_key !== "string" || body.agent_private_key.length > 64) {
          return send(400, { reason: "invalid agent_private_key" });
        }
        const creds = { AGENT_ID: body.agent_id, AGENT_PRIVATE_KEY: body.agent_private_key };
        return finish(await withEnv(creds, () => runShopping(id)));
      }
      send(404, { reason: "not found" });
    } catch (e) {
      const message = (e as Error).message ?? "";
      const status = e instanceof RunError ? e.status : /rate limit|quota|429/i.test(message) ? 503 : 500;
      emit("run.error", { run_id: runId, intent_id: intentId, status, reason: message.slice(0, 300) });
      if (e instanceof RunError) return send(e.status, { reason: e.message });
      if (status === 503) {
        return send(503, { reason: "the AI model's usage limit is reached for now; try again later" });
      }
      send(500, { reason: "agent run failed" });
    }
  });
  server.listen(port, host, () => console.log(`intentlock agent listening on http://${host}:${port} (POST /run)`));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();
