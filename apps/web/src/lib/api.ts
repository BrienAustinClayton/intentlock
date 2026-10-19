/**
 * IntentLock API client.
 * Base URL from NEXT_PUBLIC_API_URL env var.
 * All errors surface as ApiError.
 */

import type {
  AgentKeysResponse,
  ConsoleMetricsResponse,
  CreateAgentRequest,
  CreateIntentRequest,
  CreateIntentResponse,
  CreateMandateRequest,
  CreateUserRequest,
  CreateUserResponse,
  GetCatalogResponse,
  GetGraphRiskResponse,
  GetIntentResponse,
  GetOrderResponse,
  GetOrdersResponse,
  GetProofResponse,
  GraphAskRequest,
  GraphAskResponse,
  HealthResponse,
  LabRunRequest,
  LabRunResponse,
  LabScenario,
  LlmUsageResponse,
  Mandate,
  Order,
  OrderApprovalRequest,
  OrderStatus,
  ScheduleEvent,
  ScheduleLoadResponse,
  ScheduleProposeRequest,
  VaultSetupResponse,
  VerifyProofRequest,
  VerifyProofResponse,
  Agent,
} from "./types";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** Full error body, for errors that carry more than a reason (e.g. a cart check). */
    public readonly data: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function baseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new ApiError(0, "config_error", "NEXT_PUBLIC_API_URL is not set");
  }
  return url.replace(/\/$/, "");
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const base = baseUrl(); // throws ApiError(0, "config_error") if unset
  const url = `${base}${path}`;

  let res: Response;
  try {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    res = await fetch(url, {
      ...init,
      headers,
    });
  } catch (err) {
    throw new ApiError(
      0,
      "network_error",
      err instanceof Error ? err.message : "Network error"
    );
  }

  if (!res.ok) {
    let code = "http_error";
    let message = res.statusText;
    try {
      const body = (await res.json()) as Record<string, unknown>;
      if (typeof body.error === "string") code = body.error;
      if (typeof body.message === "string") message = body.message;
      else if (typeof body.detail === "string") message = body.detail;
    } catch {
      code = "bad_json";
    }
    throw new ApiError(res.status, code, message);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, "bad_json", "Response body is not valid JSON");
  }
}

function get<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, { method: "GET", ...init });
}

function post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
}

function patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const health = (): Promise<HealthResponse> => get("/health");

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const createUser = (req: CreateUserRequest): Promise<CreateUserResponse> =>
  post("/users", req);

// ---------------------------------------------------------------------------
// Vault / PayPal
// ---------------------------------------------------------------------------

export const getVaultSetup = (userId: string): Promise<VaultSetupResponse> =>
  get(`/vault/setup?user_id=${encodeURIComponent(userId)}`);

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export const createAgent = (req: CreateAgentRequest): Promise<Agent> =>
  post("/agents", req);

export const revokeAgent = (id: string): Promise<Agent> =>
  post(`/agents/${encodeURIComponent(id)}/revoke`);

export const getAgentKeys = (): Promise<AgentKeysResponse> =>
  get("/.well-known/agent-keys");

// ---------------------------------------------------------------------------
// Mandates
// ---------------------------------------------------------------------------

export const createMandate = (req: CreateMandateRequest): Promise<Mandate> =>
  post("/mandates", req);

export const updateMandate = (
  id: string,
  req: Partial<CreateMandateRequest>
): Promise<Mandate> => patch(`/mandates/${encodeURIComponent(id)}`, req);

export const revokeMandate = (id: string): Promise<Mandate> =>
  post(`/mandates/${encodeURIComponent(id)}/revoke`);

export const getMandates = (userId: string): Promise<Mandate[]> =>
  get(`/mandates?user_id=${encodeURIComponent(userId)}`);

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

export const createIntent = (
  req: CreateIntentRequest
): Promise<CreateIntentResponse> => post("/intents", req);

export const getIntent = (id: string): Promise<GetIntentResponse> =>
  get(`/intents/${encodeURIComponent(id)}`);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const getCatalog = (params?: {
  merchant?: string;
  q?: string;
  category?: string;
}): Promise<GetCatalogResponse> => {
  const qs = new URLSearchParams();
  if (params?.merchant) qs.set("merchant", params.merchant);
  if (params?.q) qs.set("q", params.q);
  if (params?.category) qs.set("category", params.category);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return get(`/catalog${query}`);
};

// NOTE: POST /checkout is agent-only (signed request). No web client method.

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const getOrders = (params?: {
  user_id?: string;
  status?: OrderStatus;
}): Promise<GetOrdersResponse> => {
  const qs = new URLSearchParams();
  if (params?.user_id) qs.set("user_id", params.user_id);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return get(`/orders${query}`);
};

export const getOrder = (id: string): Promise<GetOrderResponse> =>
  get(`/orders/${encodeURIComponent(id)}`);

export const submitOrderApproval = (
  id: string,
  req: OrderApprovalRequest
): Promise<Order> => post(`/orders/${encodeURIComponent(id)}/approval`, req);

// ---------------------------------------------------------------------------
// Proofs
// ---------------------------------------------------------------------------

export const getProof = (orderId: string): Promise<GetProofResponse> =>
  get(`/orders/${encodeURIComponent(orderId)}/proof`);

export const verifyProof = (req: VerifyProofRequest): Promise<VerifyProofResponse> =>
  post("/proofs/verify", req);

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export const getGraphRisk = (orderId: string): Promise<GetGraphRiskResponse> =>
  get(`/graph/risk/${encodeURIComponent(orderId)}`);

export const graphAsk = (req: GraphAskRequest): Promise<GraphAskResponse> =>
  post("/graph/ask", req);

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export const scheduleLoad = (userId: string): Promise<ScheduleLoadResponse> =>
  get(`/schedule/load?user_id=${encodeURIComponent(userId)}`);

export const scheduleSync = (
  body: Partial<ScheduleLoadResponse>
): Promise<ScheduleLoadResponse> => post("/schedule/sync", body);

export const schedulePropose = (
  req: ScheduleProposeRequest
): Promise<ScheduleEvent> => post("/schedule/propose", req);

// ---------------------------------------------------------------------------
// Lab
// ---------------------------------------------------------------------------

export const runLabScenario = (
  scenario: LabScenario,
  req: LabRunRequest
): Promise<LabRunResponse> =>
  post(`/lab/${encodeURIComponent(scenario)}`, req);

export const labReset = (): Promise<{ ok: boolean; deleted: Record<string, number> }> =>
  post("/lab/reset");

// ---------------------------------------------------------------------------
// LLM Usage
// ---------------------------------------------------------------------------

export const getLlmUsage = (): Promise<LlmUsageResponse> => get("/llm/usage");

// ---------------------------------------------------------------------------
// Console metrics
// ---------------------------------------------------------------------------

export const getConsoleMetrics = (): Promise<ConsoleMetricsResponse> =>
  get("/console/metrics");
