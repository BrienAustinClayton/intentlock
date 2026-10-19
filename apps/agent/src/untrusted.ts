/**
 * Third-party product text is data. Listings whose title or brand talks to an AI agent (or hides characters)
 * never reach the model: dropped before ranking. Mirrors services/intentlock/app/untrusted.py.
 */
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­]/;

const AGENT_DIRECTED: RegExp[] = [
  /\b(?:ai|llm|shopping)\s+(?:agent|assistant|model)s?\b/i,
  /\bignore\s+(?:(?:all|any|the|previous|prior|above|earlier|your)\s+)*(?:instructions|rules|prompts?)/i,
  /\b(?:system|developer)\s+(?:prompt|message|instructions)\b/i,
  /\b(?:the\s+)?user\s+(?:has\s+)?(?:already\s+)?(?:approved|authori[sz]ed|confirmed)\b/i,
  /\bdo\s+not\s+(?:tell|mention|show|inform)\b/i,
  /\badd\s+.{1,60}?\s+to\s+(?:the\s+|your\s+)?cart\b/i,
  /\b(?:apply|use)\s+(?:the\s+)?(?:coupon|promo|discount)\s+code\b/i,
  /\b(?:send|email|forward|reveal|share)\s+(?:the\s+|your\s+)?(?:card|payment|password|credentials|token|api\s*key)/i,
  /\byou\s+(?:must|should|are\s+required\s+to)\s+(?:buy|purchase|choose|select|recommend)\b/i,
  /<\/?(?:system|instructions?|assistant|tool)>/i,
];

export function suspiciousText(...parts: (string | undefined | null)[]): boolean {
  return parts.some((p) => typeof p === "string" && (INVISIBLE.test(p) || AGENT_DIRECTED.some((r) => r.test(p))));
}

/** Drop listings that try to talk to the agent. */
export function safeListings<T extends { title: string; brand?: string }>(items: T[]): T[] {
  return items.filter((p) => !suspiciousText(p.title, p.brand));
}
