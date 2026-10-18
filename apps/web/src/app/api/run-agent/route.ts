/**
 * POST /api/run-agent
 *
 * Triggers the shopping agent. If env AGENT_RUN_URL is unset, returns
 * 503 {"reason":"agent not deployed yet"}.
 * POST handlers are dynamic by default; no segment config needed.
 */
export async function POST(request: Request): Promise<Response> {
  const agentRunUrl = process.env.AGENT_RUN_URL;

  if (!agentRunUrl) {
    return Response.json(
      { reason: "agent not deployed yet" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const upstream = await fetch(agentRunUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch {
    return Response.json(
      { reason: "agent unreachable" },
      { status: 503 }
    );
  }
}
