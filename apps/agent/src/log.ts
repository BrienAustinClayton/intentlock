/** One JSON line per run step, same shape as the API's run log, so both sides match on run_id. */
export function emit(event: string, fields: Record<string, unknown> = {}): void {
  const line: Record<string, unknown> = { ts: new Date().toISOString(), service: "agent", event };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) line[k] = v;
  console.log(JSON.stringify(line));
}
