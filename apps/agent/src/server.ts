/**
 * Plain Node entry (`pnpm --filter agent start`) and the HTTP trigger used on Astropods too.
 *   POST /run {"intent_id":"int_..."}  -> run the shopping agent for that signed intent
 *   GET  /health
 */
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { env } from "./config.ts";
import { RunError, runShopping } from "./run.ts";

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
        let intentId: unknown;
        try {
          intentId = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}").intent_id;
        } catch {
          return send(400, { reason: "invalid JSON" });
        }
        if (typeof intentId !== "string") return send(400, { reason: "intent_id required" });
        return send(200, await runShopping(intentId));
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
