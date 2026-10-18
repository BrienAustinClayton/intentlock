import { NextResponse, type NextRequest } from "next/server";
import {
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  STAGE_PATH,
  appUrl,
  callApi,
  isStage,
  setSession,
} from "@/lib/server/auth";
import { safeNext } from "@/lib/server/next-path";

const FLOW_COOKIES = [GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE, GOOGLE_NEXT_COOKIE];

export async function GET(req: NextRequest) {
  const base = appUrl(req);
  const q = req.nextUrl.searchParams;
  const state = q.get("state");
  const code = q.get("code");
  const expected = req.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  const verifier = req.cookies.get(GOOGLE_VERIFIER_COOKIE)?.value;
  const next = safeNext(req.cookies.get(GOOGLE_NEXT_COOKIE)?.value);

  const done = (url: string) => {
    const res = NextResponse.redirect(url);
    for (const n of FLOW_COOKIES) res.cookies.delete({ name: n, path: "/api/auth/google" });
    return res;
  };
  const fail = (reason: string) => done(`${base}/login?error=${encodeURIComponent(reason)}`);

  if (q.get("error")) return fail("google_cancelled");
  if (!state || !code || !expected || !verifier || state !== expected) return fail("google_state_mismatch");

  const { status, data } = await callApi("/auth/google", {
    body: { code, code_verifier: verifier },
    userAgent: req.headers.get("user-agent"),
  });
  if (status !== 200 || typeof data.token !== "string" || !isStage(data.next)) {
    return fail(typeof data.error === "string" ? data.error : "google_failed");
  }
  const stage = data.next;
  const res = done(`${base}${stage === "app" ? (next ?? "/") : STAGE_PATH[stage]}`);
  setSession(res, data.token, String(data.expires_at), stage);
  return res;
}
