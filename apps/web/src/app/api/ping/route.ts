// Uptime / keep-awake cron: always 200, no session, no API call.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}

export function HEAD() {
  return new Response(null, { status: 200 });
}
