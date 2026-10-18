/**
 * RFC 9421 HTTP Message Signatures for IntentLock agent calls (see plans/CONTRACTS.md).
 * Ed25519 via node:crypto (also works under Bun). Must match data/eval/http_sig_vector.json byte for byte.
 */
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign as edSign } from "node:crypto";

export const LABEL = "sig1";
export const COMPONENTS = ["@method", "@target-uri", "content-digest"] as const;
export const ALG = "ed25519";
export const TAG = "intentlock-agent";
export const DEFAULT_LIFETIME_S = 300;

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function b64urlDecode(s: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(s.trim())) throw new Error("invalid base64url");
  return Buffer.from(s.trim().replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function b64urlEncode(b: Uint8Array): string {
  return Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Raw 32-byte Ed25519 private key (base64url, no padding) -> KeyObject. */
export function loadPrivateKey(b64url: string) {
  const raw = b64urlDecode(b64url);
  if (raw.length !== 32) throw new Error("private key must be raw 32 bytes");
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, raw]), format: "der", type: "pkcs8" });
}

/** Public key (raw 32 bytes, base64url no padding) for a private key; used by the registration script. */
export function publicKeyB64(privateKeyB64: string): string {
  const spki = createPublicKey(loadPrivateKey(privateKeyB64)).export({ format: "der", type: "spki" });
  return b64urlEncode(spki.subarray(spki.length - 32));
}

/** `sha-256=:<std base64 with padding>:` */
export function contentDigest(body: Uint8Array): string {
  return `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;
}

function sfString(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export interface SigParams {
  created: number;
  expires: number;
  nonce: string;
  keyid: string;
  tag?: string;
}

/** Order is fixed: created;expires;nonce;keyid;alg;tag. */
export function serializeSignatureParams(p: SigParams): string {
  const comps = COMPONENTS.map((c) => `"${c}"`).join(" ");
  return (
    `(${comps});created=${p.created};expires=${p.expires};nonce=${sfString(p.nonce)}` +
    `;keyid=${sfString(p.keyid)};alg=${sfString(ALG)};tag=${sfString(p.tag ?? TAG)}`
  );
}

/** Signature base: lines joined by a single LF, no trailing newline. */
export function buildSignatureBase(method: string, targetUri: string, digest: string, p: SigParams): string {
  return [
    `"@method": ${method}`,
    `"@target-uri": ${targetUri}`,
    `"content-digest": ${digest}`,
    `"@signature-params": ${serializeSignatureParams(p)}`,
  ].join("\n");
}

export interface SignInput {
  method: string;
  targetUri: string;
  body: Uint8Array;
  privateKeyB64: string;
  keyid: string;
  created?: number;
  expires?: number;
  nonce?: string;
}

export interface SignedHeaders {
  "Content-Type": string;
  "Content-Digest": string;
  "Signature-Input": string;
  Signature: string;
}

export function signRequest(i: SignInput): SignedHeaders & { signatureBase: string } {
  const created = i.created ?? Math.floor(Date.now() / 1000);
  const params: SigParams = {
    created,
    expires: i.expires ?? created + DEFAULT_LIFETIME_S,
    nonce: i.nonce ?? randomUUID(),
    keyid: i.keyid,
  };
  const digest = contentDigest(i.body);
  const base = buildSignatureBase(i.method, i.targetUri, digest, params);
  // Pure Ed25519 (no prehash) over the ASCII signature base.
  const sig = edSign(null, Buffer.from(base, "ascii"), loadPrivateKey(i.privateKeyB64)).toString("base64");
  return {
    "Content-Type": "application/json",
    "Content-Digest": digest,
    "Signature-Input": `${LABEL}=${serializeSignatureParams(params)}`,
    Signature: `${LABEL}=:${sig}:`,
    signatureBase: base,
  };
}

/** Canonical JSON: sorted keys, no whitespace, non-ASCII kept as is (same as the Python reference). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, sortKeys(o[k])]),
    );
  }
  return v;
}
