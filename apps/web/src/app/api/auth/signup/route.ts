import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, STAGE_PATH, callApi, forbidden, isStage, relay, sameOrigin, setStage } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "unauthenticated", reason: "Sign in required." }, { status: 401 });
  const body: unknown = await req.json().catch(() => ({}));
  const { status, data } = await callApi("/auth/signup", { body, token });
  if (status !== 200 || !isStage(data.next)) return relay(status, data);
  const res = NextResponse.json({ next: STAGE_PATH[data.next], user: data });
  setStage(res, data.next);
  return res;
}
