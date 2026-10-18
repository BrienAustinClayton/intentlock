import { NextResponse, type NextRequest } from "next/server";
import {
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  appUrl,
  callApi,
  shortCookie,
} from "@/lib/server/auth";
import { safeNext } from "@/lib/server/next-path";

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export async function GET(req: NextRequest) {
  const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const { status, data } = await callApi("/auth/google/url", { body: { state, code_challenge: challenge } });
  if (status !== 200 || typeof data.url !== "string") {
    const code = typeof data.error === "string" ? data.error : "google_unavailable";
    return NextResponse.redirect(`${appUrl(req)}/login?error=${encodeURIComponent(code)}`);
  }
  const res = NextResponse.redirect(data.url);
  shortCookie(res, GOOGLE_STATE_COOKIE, state);
  shortCookie(res, GOOGLE_VERIFIER_COOKIE, verifier);
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (next) shortCookie(res, GOOGLE_NEXT_COOKIE, next);
  return res;
}
