import { createOpenAI } from "@ai-sdk/openai";
import { env } from "./config.ts";

/**
 * Deployed on Astropods: the AI Gateway (ASTRO_GATEWAY_URL + ASTRO_GATEWAY_API_KEY injected, model from MODEL_DEFAULT).
 * Local / Node: any OpenAI-compatible chat endpoint from LLM_FAST_* (Groq openai/gpt-oss-120b supports tool calling).
 */
export function pickModel() {
  const gwUrl = env("ASTRO_GATEWAY_URL");
  if (gwUrl) {
    const gw = createOpenAI({ apiKey: env("ASTRO_GATEWAY_API_KEY"), baseURL: `${gwUrl.replace(/\/+$/, "")}/v1` });
    return gw.chat(env("MODEL_DEFAULT") ?? "claude-sonnet-4-6");
  }
  const base = env("LLM_FAST_BASE_URL");
  const key = env("LLM_FAST_API_KEY");
  const model = env("LLM_FAST_MODEL");
  if (!base || !key || !model) {
    throw new Error("no model: set ASTRO_GATEWAY_URL (Astropods) or LLM_FAST_BASE_URL/LLM_FAST_API_KEY/LLM_FAST_MODEL");
  }
  return createOpenAI({ apiKey: key, baseURL: base.replace(/\/+$/, "") }).chat(model);
}
