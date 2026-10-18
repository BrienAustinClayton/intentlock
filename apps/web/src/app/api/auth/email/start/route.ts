import type { NextRequest } from "next/server";
import { callApi, forbidden, relay, sameOrigin } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const { status, data } = await callApi("/auth/email/start", { body: { email: String(body.email ?? "") } });
  return relay(status, data);
}
