// Uptime / keep-awake cron: always 200, no session, no API call. The response is static on purpose:
// every request still reaches this server, which is what keeps it awake.
export function GET() {
  return Response.json({ ok: true });
}

export function HEAD() {
  return new Response(null, { status: 200 });
}
