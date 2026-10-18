import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, callApi, clearSession, forbidden, sameOrigin } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await callApi("/auth/logout", { method: "POST", token });
  const res = NextResponse.json({ ok: true });
  clearSession(res);
  return res;
}
