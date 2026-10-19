/**
 * Fetch a public web page only. Blocks private, loopback, link-local (cloud metadata) and reserved addresses,
 * checks every DNS answer, and re-checks each redirect hop, so a tool or page can't steer the agent into the
 * server's own network (SSRF).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;

function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) {
    const rest = v.slice(7);
    if (isIP(rest) === 4) return privateIp(rest);
    const m = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest); // IPv4-mapped, hex form (::ffff:7f00:1)
    if (m) {
      const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
      return privateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return true;
  }
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("only http(s) pages");
  if (url.username || url.password) throw new Error("credentials in URL not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) throw new Error("private host");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addrs.length === 0 || addrs.some(privateIp)) throw new Error("private host");
  return url;
}

export async function fetchPublicPage(raw: string, timeoutMs = 10_000): Promise<Response> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) return res;
    url = await assertPublicUrl(new URL(next, url).toString());
  }
  throw new Error("too many redirects");
}
