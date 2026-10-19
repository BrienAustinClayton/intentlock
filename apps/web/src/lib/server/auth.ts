import "server-only";
import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE = "il_session";
export const STAGE_COOKIE = "il_stage";
export const GOOGLE_STATE_COOKIE = "il_g_state";
export const GOOGLE_VERIFIER_COOKIE = "il_g_verifier";
export const GOOGLE_NEXT_COOKIE = "il_g_next";

export type Stage = "signup" | "onboarding" | "app";

export const STAGE_PATH: Record<Stage, string> = {
  signup: "/signup",
  onboarding: "/onboarding",
  app: "/",
};

// Behind Render's proxy nextUrl.origin is the internal address; the forwarded host is what the browser used.
function requestOrigin(req: NextRequest): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))?.split(",")[0].trim();
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

export function appUrl(req: NextRequest): string {
  return (process.env.APP_URL || requestOrigin(req)).replace(/\/$/, "");
}

function apiBase(): string {
  const url = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("API_URL is not set");
  return url.replace(/\/$/, "");
}

const secure = () => (process.env.APP_URL || "").startsWith("https://");

export async function callApi(
  path: string,
  init: { method?: string; body?: unknown; token?: string; userAgent?: string | null } = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.userAgent) headers["User-Agent"] = init.userAgent.slice(0, 300);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (Array.isArray(data)) return { status: res.status, data: { __list: data } };
    return { status: res.status, data };
  } catch {
    return { status: 502, data: { error: "api_unreachable", reason: "Service is unavailable. Try again shortly." } };
  }
}

export function isStage(v: unknown): v is Stage {
  return v === "signup" || v === "onboarding" || v === "app";
}

export function setSession(res: NextResponse, token: string, expiresAt: string, stage: Stage) {
  const expires = new Date(expiresAt);
  const base = { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/", expires };
  res.cookies.set(SESSION_COOKIE, token, base);
  res.cookies.set(STAGE_COOKIE, stage, base);
}

export function setStage(res: NextResponse, stage: Stage) {
  res.cookies.set(STAGE_COOKIE, stage, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession(res: NextResponse) {
  for (const name of [SESSION_COOKIE, STAGE_COOKIE]) res.cookies.delete(name);
}

export function shortCookie(res: NextResponse, name: string, value: string) {
  res.cookies.set(name, value, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
}

/** Reject cross-site form posts even if a browser ignores SameSite. */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  return !origin || origin === appUrl(req) || origin === requestOrigin(req);
}

export function forbidden() {
  return NextResponse.json({ error: "forbidden", reason: "Cross-site request blocked." }, { status: 403 });
}

export function relay(status: number, data: Record<string, unknown>) {
  return NextResponse.json(data, { status });
}
