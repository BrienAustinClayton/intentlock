import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

/** Per-run state shared by tools. LLM output never sets these; code does. */
export interface RunContext {
  traceId: string;
  intentId?: string;
  products: Map<string, import("./catalog.ts").Product>;
  checkouts: CheckoutResult[];
  errors: string[];
  lastCart?: { merchant: string; cart: CartLine[]; total: string };
}

export interface CartLine {
  product_id: string;
  title: string;
  variant: string | null;
  qty: number;
  unit_price: string;
  currency: string;
  category: string;
  url: string | null;
}

export interface CheckoutResult {
  order_id: string;
  status: string;
  decision: string;
  reasons: string[];
}

const als = new AsyncLocalStorage<RunContext>();

/** 32 hex chars: valid OpenTelemetry / Mastra trace id. */
export const newTraceId = (): string => randomBytes(16).toString("hex");

export function newRunContext(intentId?: string, traceId = newTraceId()): RunContext {
  return { traceId, intentId, products: new Map(), checkouts: [], errors: [] };
}

export const runWith = <T>(ctx: RunContext, fn: () => Promise<T>): Promise<T> => als.run(ctx, fn);

/** Tools called outside runShopping (Astropods chat mode) get a fresh context kept for that call chain. */
let fallback: RunContext | undefined;
export function currentRun(): RunContext {
  return als.getStore() ?? (fallback ??= newRunContext());
}
