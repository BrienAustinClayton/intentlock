export function safeNext(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  if (v.startsWith("/login") || v.startsWith("/api/")) return null;
  return v.slice(0, 512);
}
