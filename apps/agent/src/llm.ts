import { env } from "./config.ts";

export class LlmLimitError extends Error {}

function endpoint(): { url: string; key: string; models: string[] } {
  const gw = env("ASTRO_GATEWAY_URL");
  if (gw) {
    return {
      url: `${gw.replace(/\/+$/, "")}/v1/chat/completions`,
      key: env("ASTRO_GATEWAY_API_KEY") ?? "",
      models: [env("MODEL_DEFAULT") ?? "claude-sonnet-4-6"],
    };
  }
  const base = env("LLM_FAST_BASE_URL");
  const key = env("LLM_FAST_API_KEY");
  const model = env("LLM_FAST_MODEL");
  if (!base || !key || !model) throw new Error("no model configured (LLM_FAST_BASE_URL / LLM_FAST_API_KEY / LLM_FAST_MODEL)");
  // Groq limits tokens per model per day, so a second model keeps runs going when the first is used up.
  const fallback = env("LLM_FAST_FALLBACK_MODEL") ?? "openai/gpt-oss-20b";
  return { url: `${base.replace(/\/+$/, "")}/chat/completions`, key, models: fallback === model ? [model] : [model, fallback] };
}

function parseObject<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** One chat completion that must return a JSON object. */
export async function chatJson<T>(system: string, user: string, maxTokens = 600): Promise<T> {
  const { url, key, models } = endpoint();
  let limited = false;
  let lastError = "no model available";
  for (const model of models) {
    // gpt-oss models reason before answering and the reasoning counts against max_tokens.
    const reasoning = model.includes("gpt-oss") ? { reasoning_effort: "low" } : {};
    for (const strict of [true, false]) {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: Math.max(maxTokens, 1000),
          ...reasoning,
          ...(strict ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429) {
        limited = true;
        break;
      }
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = `model call failed (HTTP ${res.status}${j?.error?.code ? ` ${j.error.code}` : ""})`;
        if (res.status === 400 && strict) continue; // e.g. json_validate_failed: try once without strict JSON mode
        break;
      }
      const parsed = parseObject<T>(String(j?.choices?.[0]?.message?.content ?? ""));
      if (parsed) return parsed;
      lastError = "model returned invalid JSON";
    }
  }
  if (limited && lastError === "no model available") throw new LlmLimitError("rate limit: the AI model's usage limit is reached for now");
  throw new Error(lastError);
}
