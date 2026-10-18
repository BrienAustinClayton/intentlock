/**
 * Astropods entry (runs in the container under Bun via `ast project start`, and on deploy).
 *   - serve(agent): Astropods messaging (playground on localhost:3100 during dev) with the same tools as POST /run
 *   - startServer(): POST /run {intent_id}, the endpoint apps/web calls via AGENT_RUN_URL
 *
 * The plain Node entry (`pnpm --filter agent start`) is src/server.ts and needs no Astropods runtime.
 */
import { serve } from "@astropods/adapter-mastra";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { Mastra } from "@mastra/core/mastra";
import { Observability } from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";
import { createShoppingAgent } from "../src/agent.ts";
import { env } from "../src/config.ts";
import { startServer } from "../src/server.ts";

const memory = new Memory({ storage: new LibSQLStore({ id: "memory", url: ":memory:" }) });

function otlpTracesEndpoint(): string {
  const raw = env("OTEL_EXPORTER_OTLP_ENDPOINT") ?? "http://localhost:4318";
  try {
    const url = new URL(raw);
    if (!url.pathname || url.pathname === "/") url.pathname = "/v1/traces";
    return url.toString();
  } catch {
    return `${raw.replace(/\/+$/, "")}/v1/traces`;
  }
}

const observability = new Observability({
  configs: {
    otel: {
      serviceName: "intentlock-agent",
      exporters: [
        new OtelExporter({ provider: { custom: { endpoint: otlpTracesEndpoint(), protocol: "http/protobuf" } } }),
      ],
    },
  },
});

const agent = createShoppingAgent({ chat: true, memory });
new Mastra({ agents: { "intentlock-agent": agent }, observability });

serve(agent);

// Deployed with agent.interfaces.frontend the platform sets PORT=80; locally dev.interfaces.frontend.port is used.
startServer(Number(env("PORT") ?? 8808), env("HOST") ?? "0.0.0.0");
