import "server-only";
import OpenAI from "openai";

let client: OpenAI | null = null;

function need(name: "LLM_FAST_BASE_URL" | "LLM_FAST_API_KEY" | "LLM_FAST_MODEL"): string {
  const v = process.env[name];
  if (!v || v === "__FILL_ME__") throw new Error(`${name} is not set`);
  return v;
}

export function fastModel(): string {
  return need("LLM_FAST_MODEL");
}

export function getFastClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: need("LLM_FAST_API_KEY"),
      baseURL: need("LLM_FAST_BASE_URL"),
      maxRetries: 1,
      timeout: 15_000,
    });
  }
  return client;
}
