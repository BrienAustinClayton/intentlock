import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate on cookie presence only; the API validates the session on every call.
const PUBLIC = [/^\/api\/auth\//, /^\/store\//, /^\/proof\//];
const FLOW: Record<string, string> = { signup: "/signup", onboarding: "/onboarding" };

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = req.cookies.get("il_session")?.value;
  const stage = req.cookies.get("il_stage")?.value ?? "app";
  const go = (path: string) => NextResponse.redirect(new URL(path, req.url));

  if (pathname === "/login") {
    if (!session) return NextResponse.next();
    return go(FLOW[stage] ?? "/");
  }
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthenticated", reason: "Sign in required." }, { status: 401 });
    }
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return go(`/login${next}`);
  }

  if (pathname.startsWith("/api/")) return NextResponse.next();
  const flowPath = FLOW[stage];
  if (flowPath && pathname !== flowPath) return go(flowPath);
  if (!flowPath && (pathname === "/signup" || pathname === "/onboarding")) return go("/");
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|woff2?)$).*)"],
};
