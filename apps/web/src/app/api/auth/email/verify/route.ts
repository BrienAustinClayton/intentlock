import { NextResponse, type NextRequest } from "next/server";
import { STAGE_PATH, callApi, forbidden, isStage, relay, sameOrigin, setSession } from "@/lib/server/auth";
import { safeNext } from "@/lib/server/next-path";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; code?: unknown; next?: unknown };
  const { status, data } = await callApi("/auth/email/verify", {
    body: { email: String(body.email ?? ""), code: String(body.code ?? "") },
    userAgent: req.headers.get("user-agent"),
  });
  if (status !== 200 || typeof data.token !== "string" || !isStage(data.next)) return relay(status, data);
  const stage = data.next;
  const to = stage === "app" ? (safeNext(body.next) ?? "/") : STAGE_PATH[stage];
  const res = NextResponse.json({ next: to, is_new: data.is_new === true });
  setSession(res, data.token, String(data.expires_at), stage);
  return res;
}
