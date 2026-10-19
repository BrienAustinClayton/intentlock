import { Agent } from "@mastra/core/agent";
import { CHAT_INSTRUCTIONS, SHOPPING_INSTRUCTIONS } from "./instructions.ts";
import { pickModel } from "./model.ts";
import { draftTools, tools } from "./tools.ts";

export function createShoppingAgent(opts: { chat?: boolean; draft?: boolean; memory?: ConstructorParameters<typeof Agent>[0]["memory"] } = {}) {
  return new Agent({
    id: "intentlock-agent",
    name: "Sepilo Shopping Agent",
    instructions: opts.chat ? CHAT_INSTRUCTIONS : SHOPPING_INSTRUCTIONS,
    model: pickModel(),
    tools: opts.draft ? draftTools : tools,
    ...(opts.memory ? { memory: opts.memory } : {}),
    defaultOptions: {
      tracingOptions: { tags: ["astro", "agent:intentlock-agent"], metadata: { agent_id: "intentlock-agent" } },
    },
  });
}
