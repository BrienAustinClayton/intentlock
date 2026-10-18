"use client";

import { useTransition, useState } from "react";
import { Check as CheckIcon, Flag, X } from "lucide-react";
import type { GetProofResponse, ProofBundle, CheckStep, CheckResult } from "@/lib/types";
import { verifyProofAction } from "./actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decisionColor(d: string): string {
  if (d === "capture") return "#14b8a6";   // teal
  if (d === "void" || d === "reject") return "#f43f5e";  // red
  if (d === "hold") return "#f59e0b";      // amber
  return "#6b7280";
}

function resultColor(r: CheckResult): string {
  if (r === "pass") return "#14b8a6";
  if (r === "fail" || r === "error") return "#f43f5e";
  if (r === "flag") return "#f59e0b";
  return "#9ca3af";
}

function resultIcon(r: CheckResult) {
  if (r === "pass") return <CheckIcon className="w-3.5 h-3.5" strokeWidth={2.2} />;
  if (r === "fail" || r === "error") return <X className="w-3.5 h-3.5" strokeWidth={2.2} />;
  if (r === "flag") return <Flag className="w-3.5 h-3.5" strokeWidth={2.2} />;
  return "–";
}

function stepLabel(s: CheckStep): string {
  const labels: Record<CheckStep, string> = {
    verify_agent: "Verify Agent",
    check_mandate: "Check Mandate",
    authorize_payment: "Authorize Payment",
    scan_injection: "Scan Injection",
    intent_diff: "Intent Diff",
    graph_risk: "Graph Risk",
    decide: "Decide",
    capture_or_void: "Capture or Void",
    build_proof: "Build Proof",
  };
  return labels[s] ?? s;
}

function fmt(dt: string): string {
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="ml-2 px-2 py-0.5 text-xs rounded border intentlock-btn-outline"
      style={{ borderRadius: "4px", padding: "2px 8px" }}
      aria-label={copied ? "Copied to clipboard" : "Copy SHA-256 to clipboard"}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="saas-card p-6 mb-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-geist-mono, monospace)",
        fontSize: "0.78rem",
        wordBreak: "break-all",
      }}
    >
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.4rem", flexWrap: "wrap" }}>
      <span style={{ minWidth: "160px", color: "var(--color-text-muted)", fontSize: "0.85rem", flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: "0.85rem" }}>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tamper helper – change the unit_price of the first cart item
// ---------------------------------------------------------------------------

function tamperBundle(bundle: ProofBundle): ProofBundle {
  if (!bundle.cart || bundle.cart.length === 0) return bundle;
  const tamperedCart = bundle.cart.map((item, i) => {
    if (i !== 0) return item;
    const orig = parseFloat(String(item.unit_price));
    const tampered = (orig + 1).toFixed(2);
    return { ...item, unit_price: tampered };
  });
  return { ...bundle, cart: tamperedCart };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ProofClient({ proof }: { proof: GetProofResponse }) {
  const { bundle, sha256, signature, valid } = proof;

  const astropodsBase =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_ASTROPODS_TRACE_BASE ?? ""
      : "";

  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    sha256: string;
    tampered: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleVerify() {
    startTransition(async () => {
      try {
        const res = await verifyProofAction(bundle, signature);
        setVerifyResult({ ...res, tampered: false });
      } catch {
        setVerifyResult({ valid: false, sha256: "", tampered: false });
      }
    });
  }

  function handleTamperDemo() {
    startTransition(async () => {
      try {
        const tampered = tamperBundle(bundle);
        const res = await verifyProofAction(tampered, signature);
        setVerifyResult({ ...res, tampered: true });
      } catch {
        setVerifyResult({ valid: false, sha256: "", tampered: true });
      }
    });
  }

  function handleDownload() {
    const data = JSON.stringify({ bundle, sha256, signature, public_key: proof.public_key, valid }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proof-${bundle.order?.id ?? "unknown"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------------------
  // Mandate signed_json fields
  // -------------------------------------------------------------------------
  const mandateJson = (bundle.mandate?.signed_json ?? {}) as Record<string, unknown>;

  return (
    <div
      style={{
        maxWidth: "820px",
        margin: "0 auto",
        padding: "2rem 1.5rem",
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>
            Proof of Intent
          </h1>
          <span
            style={{
              padding: "3px 12px",
              borderRadius: "9999px",
              fontSize: "0.8rem",
              fontWeight: 700,
              textTransform: "uppercase",
              background: decisionColor(bundle.decision),
              color: "#fff",
            }}
          >
            {bundle.decision}
          </span>
          <span
            style={{
              padding: "3px 12px",
              borderRadius: "9999px",
              fontSize: "0.85rem",
              fontWeight: 700,
              background: valid ? "#14b8a6" : "#f43f5e",
              color: "#fff",
            }}
          >
            <span className="inline-flex items-center gap-1">{valid ? <CheckIcon className="w-3.5 h-3.5" strokeWidth={2.2} /> : <X className="w-3.5 h-3.5" strokeWidth={2.2} />}{valid ? "Valid" : "Invalid"}</span>
          </span>
        </div>
        <div style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>
          Issued: {fmt(bundle.issued_at)} &nbsp;|&nbsp; Order: <Mono>{bundle.order?.id}</Mono>
        </div>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>SHA-256:</span>
          <Mono>{sha256}</Mono>
          <CopyButton text={sha256} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Actions                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button
          className="intentlock-btn-primary"
          onClick={handleVerify}
          disabled={isPending}
          aria-label="Verify proof signature"
        >
          {isPending ? "Verifying…" : "Verify"}
        </button>
        <button
          className="intentlock-btn-outline"
          onClick={handleTamperDemo}
          disabled={isPending}
          aria-label="Demonstrate tamper detection by modifying the bundle"
        >
          Tamper Demo
        </button>
        <button
          className="intentlock-btn-outline"
          onClick={handleDownload}
          aria-label="Download proof bundle as JSON"
        >
          Download JSON
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Verify result banner                                                 */}
      {/* ------------------------------------------------------------------ */}
      {verifyResult && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            marginBottom: "1rem",
            background: verifyResult.valid ? "#ccfbf1" : "#ffe4e6",
            border: `1px solid ${verifyResult.valid ? "#14b8a6" : "#f43f5e"}`,
            color: verifyResult.valid ? "#0d9488" : "#be123c",
            fontSize: "0.88rem",
            fontWeight: 600,
          }}
        >
          {verifyResult.tampered ? "Tamper demo — " : ""}
          Signature is {verifyResult.valid ? "valid" : "invalid"}
          {verifyResult.sha256 && (
            <span style={{ fontWeight: 400, marginLeft: "0.5rem" }}>
              (sha256: <Mono>{verifyResult.sha256.slice(0, 16)}…</Mono>)
            </span>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Request                                                              */}
      {/* ------------------------------------------------------------------ */}
      <Section title="Request">
        <Row label="Intent ID"><Mono>{bundle.intent?.id}</Mono></Row>
        <Row label="Signed at">{fmt(bundle.intent?.signed_at)}</Row>
        <Row label="Request text">
          <span
            style={{
              display: "block",
              whiteSpace: "pre-wrap",
              background: "color-mix(in srgb, var(--color-border) 30%, transparent)",
              borderRadius: "4px",
              padding: "0.4rem 0.6rem",
              fontSize: "0.85rem",
            }}
          >
            {bundle.intent?.request_text}
          </span>
        </Row>
        <Row label="Signature">
          <Mono>{bundle.intent?.signature}</Mono>
        </Row>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Mandate                                                              */}
      {/* ------------------------------------------------------------------ */}
      <Section title="Mandate">
        <Row label="Mandate ID"><Mono>{bundle.mandate?.id}</Mono></Row>
        {Array.isArray(mandateJson.categories) && (
          <Row label="Categories">
            {(mandateJson.categories as string[]).join(", ")}
          </Row>
        )}
        {Array.isArray(mandateJson.merchants) && (
          <Row label="Merchants">
            {(mandateJson.merchants as string[]).join(", ")}
          </Row>
        )}
        {mandateJson.budget_amount !== undefined && (
          <Row label="Budget">
            {`${String(mandateJson.budget_amount)} ${String(mandateJson.currency ?? "")} / ${String(mandateJson.budget_period ?? "")}`}
          </Row>
        )}
        {typeof mandateJson.starts_at === "string" && (
          <Row label="Starts">{fmt(mandateJson.starts_at)}</Row>
        )}
        {typeof mandateJson.expires_at === "string" && (
          <Row label="Expires">{fmt(mandateJson.expires_at)}</Row>
        )}
        <Row label="Signature">
          <Mono>{bundle.mandate?.signature}</Mono>
        </Row>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Cart                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Section title="Cart">
        {bundle.cart && bundle.cart.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem", minWidth: "460px" }}>
            <thead>
              <tr style={{ color: "var(--color-text-muted)", textAlign: "left" }}>
                <th style={{ padding: "4px 8px 4px 0" }}>Product</th>
                <th style={{ padding: "4px 8px" }}>Variant</th>
                <th style={{ padding: "4px 8px" }}>Qty</th>
                <th style={{ padding: "4px 8px" }}>Unit Price</th>
                <th style={{ padding: "4px 8px" }}>Category</th>
              </tr>
            </thead>
            <tbody>
              {bundle.cart.map((item, i) => (
                <tr
                  key={i}
                  style={{
                    borderTop: "1px solid var(--color-border)",
                  }}
                >
                  <td style={{ padding: "6px 8px 6px 0" }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>
                      <Mono>{item.product_id}</Mono>
                    </div>
                  </td>
                  <td style={{ padding: "6px 8px" }}>{item.variant || "–"}</td>
                  <td style={{ padding: "6px 8px" }}>{item.qty}</td>
                  <td style={{ padding: "6px 8px" }}>
                    {item.unit_price} {item.currency}
                  </td>
                  <td style={{ padding: "6px 8px" }}>{item.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>No cart items.</p>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Checks timeline                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Section title="Checks">
        {bundle.checks && bundle.checks.length > 0 ? (
          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {bundle.checks.map((c, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6rem",
                  padding: "0.4rem 0",
                  borderBottom: i < bundle.checks.length - 1 ? "1px solid var(--color-border)" : "none",
                }}
              >
                <span
                  style={{
                    minWidth: "1.4rem",
                    fontWeight: 700,
                    color: resultColor(c.result),
                    fontSize: "1rem",
                    lineHeight: 1.4,
                  }}
                >
                  {resultIcon(c.result)}
                </span>
                <div style={{ flex: 1, fontSize: "0.83rem" }}>
                  <span style={{ fontWeight: 600 }}>{stepLabel(c.step)}</span>
                  {" — "}
                  <span
                    style={{
                      color: resultColor(c.result),
                      fontWeight: 600,
                    }}
                  >
                    {c.result}
                  </span>
                  {c.score !== null && c.score !== undefined && (
                    <span style={{ color: "var(--color-text-muted)", marginLeft: "0.5rem" }}>
                      score: {c.score}
                    </span>
                  )}
                  <span style={{ color: "var(--color-text-muted)", marginLeft: "0.5rem" }}>
                    {c.duration_ms}ms
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>No checks recorded.</p>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* PayPal                                                               */}
      {/* ------------------------------------------------------------------ */}
      <Section title="PayPal">
        <Row label="Order ID"><Mono>{bundle.paypal?.order_id ?? "–"}</Mono></Row>
        <Row label="Authorization ID"><Mono>{bundle.paypal?.authorization_id ?? "–"}</Mono></Row>
        <Row label="Capture ID">
          <Mono>{bundle.paypal?.capture_id ?? "–"}</Mono>
        </Row>
        <Row label="Voided">
          {bundle.paypal?.void ? (
            <span style={{ color: "#f43f5e", fontWeight: 600 }}>Yes</span>
          ) : (
            <span style={{ color: "#14b8a6", fontWeight: 600 }}>No</span>
          )}
        </Row>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Astropods trace                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Section title="Astropods Trace">
        {bundle.astropods_trace_id ? (
          astropodsBase ? (
            <a
              href={`${astropodsBase}/${bundle.astropods_trace_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-brand)", textDecoration: "underline", fontSize: "0.85rem" }}
            >
              <Mono>{bundle.astropods_trace_id}</Mono>
            </a>
          ) : (
            <Mono>{bundle.astropods_trace_id}</Mono>
          )
        ) : (
          <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>No trace ID.</span>
        )}
      </Section>
    </div>
  );
}
