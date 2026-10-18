"use client";

import { ApiError } from "@/lib/api";
import type {
  Agent,
  BudgetPeriod,
  GetOrderResponse,
  Mandate,
  Order,
  OrderApprovalRequest,
} from "@/lib/types";

export type OrderView = "all" | "needs_approval" | "paid" | "blocked" | "in_progress";

export interface Summary {
  currency: string;
  month: { orders: number; paid: number; blocked: number; spent: string };
  needs_approval: number;
  agents_active: number;
  rules_active: number;
  requests: number;
  payment_connected: boolean;
  recent_orders: Order[];
}

export interface AgentRunView {
  id: string;
  status: "running" | "ordered" | "failed";
  summary: string | null;
  errors: string[];
  order_id: string | null;
  order_status: Order["status"] | null;
  started_at: string;
  finished_at: string | null;
}

export type MyAgent = Agent & { managed: boolean };

export interface PurchaseRequest {
  id: string;
  agent_id: string;
  agent_name: string | null;
  request_text: string;
  signed_at: string;
  signature: string;
  orders: number;
  agent_managed: boolean;
  run: AgentRunView | null;
}

export interface RuleInput {
  agent_id: string;
  categories: string[];
  merchants: string[];
  budget_amount: string;
  budget_period: BudgetPeriod;
  currency: string;
  expires_at?: string | null;
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/me/${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network_error", "Network error. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) {
    // Session ended: a full load lets the proxy route to sign-in with a clean client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
  if (!res.ok) {
    const reason = typeof data.reason === "string" ? data.reason : "Something went wrong.";
    throw new ApiError(res.status, typeof data.error === "string" ? data.error : "http_error", reason);
  }
  return ("items" in data && Array.isArray(data.items) ? data.items : data) as T;
}

const id = encodeURIComponent;

export const me = {
  summary: () => call<Summary>("summary"),
  orders: (view: OrderView = "all") => call<Order[]>(`orders?view=${view}`),
  order: (orderId: string) => call<GetOrderResponse>(`orders/${id(orderId)}`),
  approve: (orderId: string, req: OrderApprovalRequest) => call<Order>(`orders/${id(orderId)}/approval`, "POST", req),
  agents: () => call<MyAgent[]>("agents"),
  createHostedAgent: (name: string) => call<MyAgent>("agents/hosted", "POST", { name }),
  connectAgent: (b: { name: string; public_key: string; device_id?: string }) => call<MyAgent>("agents", "POST", b),
  revokeAgent: (agentId: string) => call<MyAgent>(`agents/${id(agentId)}/revoke`, "POST"),
  rules: () => call<Mandate[]>("mandates"),
  createRule: (b: RuleInput) => call<Mandate>("mandates", "POST", b),
  updateRule: (ruleId: string, b: Partial<RuleInput>) => call<Mandate>(`mandates/${id(ruleId)}`, "PATCH", b),
  endRule: (ruleId: string) => call<Mandate>(`mandates/${id(ruleId)}/revoke`, "POST"),
  requests: () => call<PurchaseRequest[]>("requests"),
  createRequest: (b: { agent_id: string; request_text: string }) => call<PurchaseRequest>("requests", "POST", b),
  runRequest: (requestId: string) => call<AgentRunView>(`requests/${id(requestId)}/run`, "POST"),
  payment: () => call<{ connected: boolean }>("payment"),
  paymentSetup: () => call<{ approve_url: string }>("payment/setup", "POST"),
};
