/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { me } from "@/lib/me";
import { ArrowLeft, Check as CheckIcon, Flag, Minus, Wallet, X } from "lucide-react";
import { OrderStatusTag, merchantName, money } from "@/components/ui";
import { SkeletonBlock } from "@/components/Skeleton";
import type {
  Order,
  Check,
  Approval,
  CartItem,
  CheckStep,
  CheckResult,
  IntentDiffDetails,
  IntentDiffExplained,
  IntentDiffIssue,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Money helpers — no float math
// ---------------------------------------------------------------------------

/**
 * Compute line total using integer cent math.
 * unitPrice is a decimal string like "9.99"; qty is an integer.
 * Returns a decimal string like "19.98".
 */
function lineTotal(unitPrice: string, qty: number): string {
  const parts = unitPrice.split(".");
  const wholePart = parseInt(parts[0] ?? "0", 10);
  const fracStr = (parts[1] ?? "").padEnd(2, "0").slice(0, 2);
  const fracPart = parseInt(fracStr, 10);
  const priceCents = wholePart * 100 + fracPart;
  const totalCents = priceCents * qty;
  const d = Math.floor(totalCents / 100);
  const c = totalCents % 100;
  return `${d}.${String(c).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtTime(dt: string): string {
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
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

function resultColor(r: CheckResult): string {
  if (r === "pass") return "var(--color-status-captured)";
  if (r === "fail" || r === "error") return "var(--color-status-voided)";
  if (r === "flag") return "var(--color-status-pending-approval)";
  return "var(--color-text-muted)";
}

function resultIcon(r: CheckResult) {
  const cls = "w-3.5 h-3.5";
  if (r === "pass") return <CheckIcon className={cls} strokeWidth={2.2} />;
  if (r === "fail" || r === "error") return <X className={cls} strokeWidth={2.2} />;
  if (r === "flag") return <Flag className={cls} strokeWidth={2.2} />;
  return <Minus className={cls} strokeWidth={2.2} />;
}

function decisionColor(d: string): string {
  if (d === "capture") return "var(--color-status-captured)";
  if (d === "void" || d === "reject") return "var(--color-status-voided)";
  if (d === "hold") return "var(--color-status-pending-approval)";
  return "var(--color-text-muted)";
}

// ---------------------------------------------------------------------------
// Countdown helpers
// ---------------------------------------------------------------------------

function msUntil(dt: string): number {
  try {
    return new Date(dt).getTime() - Date.now();
  } catch {
    return 0;
  }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

// ---------------------------------------------------------------------------
// Intent Diff badge colours
// ---------------------------------------------------------------------------

function explainedBg(e: IntentDiffExplained): string {
  if (e === "yes") return "var(--color-captured-100)";
  if (e === "no") return "var(--color-danger-100)";
  return "var(--color-pending-100)";
}

function explainedColor(e: IntentDiffExplained): string {
  if (e === "yes") return "var(--color-status-captured)";
  if (e === "no") return "var(--color-status-voided)";
  return "var(--color-status-pending-approval)";
}

function issueLabel(issue: IntentDiffIssue): string {
  const labels: Record<IntentDiffIssue, string> = {
    none: "",
    extra_item: "Extra item",
    variant_mismatch: "Wrong variant",
    quantity: "Qty mismatch",
    price: "Price issue",
    address: "Address",
    merchant: "Wrong merchant",
  };
  return labels[issue] ?? issue;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="saas-card p-6 space-y-3">
      <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Line Items Table
// ---------------------------------------------------------------------------

function LineItemsTable({
  cart,
  intentDiff,
}: {
  cart: CartItem[];
  intentDiff: IntentDiffDetails | null;
}) {
  // Build a map from product_id to diff item for quick lookup
  const diffMap = new Map<string, IntentDiffDetails["items"][number]>();
  if (intentDiff) {
    for (const item of intentDiff.items) {
      diffMap.set(item.product_id, item);
    }
  }

  return (
    <Section title="Line Items">
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)", textAlign: "left" }}>
              <th style={{ padding: "4px 8px 8px 0", fontWeight: 600 }}>Item</th>
              <th style={{ padding: "4px 8px 8px", fontWeight: 600 }}>Variant</th>
              <th style={{ padding: "4px 8px 8px", fontWeight: 600, textAlign: "right" }}>Qty</th>
              <th style={{ padding: "4px 8px 8px", fontWeight: 600, textAlign: "right" }}>Unit Price</th>
              <th style={{ padding: "4px 8px 8px", fontWeight: 600, textAlign: "right" }}>Line Total</th>
              <th style={{ padding: "4px 8px 8px", fontWeight: 600 }}>Intent Diff</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item) => {
              const diff = diffMap.get(item.product_id);
              const total = lineTotal(item.unit_price, item.qty);

              return (
                <tr
                  key={item.product_id}
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  {/* Title + product_id */}
                  <td style={{ padding: "8px 8px 8px 0", verticalAlign: "top" }}>
                    <div className="font-medium" style={{ color: "var(--color-text)" }}>
                      {item.title}
                    </div>
                    <div className="font-mono text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {item.product_id}
                    </div>
                  </td>
                  <td style={{ padding: "8px", verticalAlign: "top", color: "var(--color-text)" }}>
                    {item.variant || "–"}
                  </td>
                  <td style={{ padding: "8px", verticalAlign: "top", textAlign: "right", color: "var(--color-text)" }}>
                    {item.qty}
                  </td>
                  <td style={{ padding: "8px", verticalAlign: "top", textAlign: "right", color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>
                    {item.unit_price} {item.currency}
                  </td>
                  <td style={{ padding: "8px", verticalAlign: "top", textAlign: "right", color: "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>
                    {total} {item.currency}
                  </td>

                  {/* Intent Diff badge */}
                  <td style={{ padding: "8px", verticalAlign: "top" }}>
                    {diff ? (
                      <div className="space-y-1">
                        {/* explained badge */}
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            background: explainedBg(diff.explained),
                            color: explainedColor(diff.explained),
                          }}
                        >
                          {diff.explained}
                        </span>
                        {/* issue badge (if not "none") */}
                        {diff.issue !== "none" && (
                          <span
                            className="block inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              background: "var(--color-danger-100)",
                              color: "var(--color-status-voided)",
                            }}
                          >
                            {issueLabel(diff.issue)}
                          </span>
                        )}
                        {/* reason */}
                        <p
                          className="text-xs"
                          style={{ color: "var(--color-text-muted)", maxWidth: "200px" }}
                        >
                          {diff.reason}
                        </p>
                      </div>
                    ) : (
                      <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>
                        –
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Checks Timeline
// ---------------------------------------------------------------------------

function ChecksTimeline({ checks }: { checks: Check[] }) {
  return (
    <Section title="Checks Timeline">
      {checks.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No checks recorded.
        </p>
      ) : (
        <ol className="space-y-1">
          {checks.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-2 text-sm py-1.5"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <span
                style={{
                  minWidth: "1.4rem",
                  fontWeight: 700,
                  fontSize: "1rem",
                  lineHeight: 1.4,
                  color: resultColor(c.result),
                }}
              >
                {resultIcon(c.result)}
              </span>
              <div className="flex-1">
                <span className="font-medium" style={{ color: "var(--color-text)" }}>
                  {stepLabel(c.step)}
                </span>
                {" — "}
                <span style={{ color: resultColor(c.result), fontWeight: 600 }}>
                  {c.result}
                </span>
                {c.score !== null && c.score !== undefined && (
                  <span className="ml-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    score: {c.score}
                  </span>
                )}
                <span className="ml-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {c.duration_ms}ms
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Decision + Reasons
// ---------------------------------------------------------------------------

function DecisionPanel({ decision, reasons }: { decision: string | null; reasons: string[] }) {
  if (!decision) return null;
  return (
    <Section title="Decision">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-sm font-bold"
          style={{
            background: decisionColor(decision) + "22",
            color: decisionColor(decision),
          }}
        >
          {decision}
        </span>
      </div>
      {reasons.length > 0 && (
        <ul className="space-y-1 mt-2">
          {reasons.map((r, i) => (
            <li
              key={i}
              className="text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              • {r}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Approval Panel
// ---------------------------------------------------------------------------

function ApprovalPanel({
  orderId,
  approval,
  onApprovalDone,
}: {
  orderId: string;
  approval: Approval | null | undefined;
  onApprovalDone: () => void;
}) {
  const [loading, setLoading] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>("");

  // Countdown tick
  useEffect(() => {
    if (!approval?.expires_at) return;
    const tick = () => setCountdown(formatCountdown(msUntil(approval.expires_at!)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [approval?.expires_at]);

  if (!approval) {
    return (
      <Section title="Approval">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No approval requested.
        </p>
      </Section>
    );
  }

  // Already decided
  if (approval.decision) {
    return (
      <Section title="Approval">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-sm font-bold"
            style={{
              background:
                approval.decision === "approve"
                  ? "var(--color-captured-100)"
                  : "var(--color-danger-100)",
              color:
                approval.decision === "approve"
                  ? "var(--color-status-captured)"
                  : "var(--color-status-voided)",
            }}
          >
            {approval.decision === "approve" ? "Approved" : "Declined"}
          </span>
          {approval.decided_at && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              at {fmtTime(approval.decided_at)}
            </span>
          )}
        </div>
      </Section>
    );
  }

  // Pending — show Approve / Decline buttons + countdown
  async function handleDecision(decision: "approve" | "decline") {
    setLoading(decision);
    setError(null);
    try {
      await me.approve(orderId, { decision });
      onApprovalDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to submit decision.");
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <Section title="Approval Required">
      <p className="text-sm" style={{ color: "var(--color-text)" }}>
        This order is waiting for your approval. It will be auto-voided if not
        decided in time.
      </p>
      {approval.expires_at && (
        <div
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--color-status-pending-approval)" }}
        >
          <span>Time remaining:</span>
          <span className="font-mono">{countdown}</span>
        </div>
      )}
      <div className="flex gap-3 mt-2">
        <button
          className="btn-success"
          disabled={loading !== null}
          onClick={() => handleDecision("approve")}
        >
          {loading === "approve" ? "Approving..." : "Approve"}
        </button>
        <button
          className="btn-danger"
          disabled={loading !== null}
          onClick={() => handleDecision("decline")}
        >
          {loading === "decline" ? "Declining..." : "Decline"}
        </button>
      </div>
      {error && (
        <p className="text-sm mt-2" style={{ color: "var(--color-status-voided)" }}>
          {error}
        </p>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// OrderDetailClient
// ---------------------------------------------------------------------------

interface Props {
  orderId: string;
}

export default function OrderDetailClient({ orderId }: Props) {
  const [order, setOrder] = useState<
    (Order & { checks: Check[]; approval: Approval | null }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [retryKey, setRetryKey] = useState(0);
  const loadOrder = useCallback(() => setRetryKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    me.order(orderId)
      .then((data) => {
        if (!active) return;
        setOrder(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setError("Order not found.");
          } else if (err.status === 0 && err.code === "config_error") {
            setError("API is not configured (NEXT_PUBLIC_API_URL missing).");
          } else {
            setError(`Failed to load order: ${err.message}`);
          }
        } else {
          setError("An unexpected error occurred.");
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [orderId, retryKey]);

  // Auto-refresh while order is in a transitional state
  useEffect(() => {
    if (!order) return;
    const inTransit =
      order.status === "received" ||
      order.status === "authorized" ||
      order.status === "checking";
    if (!inTransit) return;
    const t = setInterval(loadOrder, 2000);
    return () => clearInterval(t);
  }, [order, loadOrder]);

  if (loading) {
    return (
      <div className="max-w-4xl w-full space-y-5" aria-label="Loading order">
        <div className="rounded-lg border p-5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <SkeletonBlock lines={3} />
        </div>
        <div className="rounded-lg border p-5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <SkeletonBlock lines={5} />
        </div>
        <div className="rounded-lg border p-5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <SkeletonBlock lines={4} />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl w-full">
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          role="alert"
          style={{
            borderColor: "var(--color-danger-200)",
            background: "var(--color-danger-50)",
            color: "var(--color-status-voided)",
          }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>{error ?? "Order not found."}</span>
            <button
              className="intentlock-btn-outline btn-sm"
              onClick={loadOrder}
              aria-label="Retry loading order"
            >
              Retry
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <Link href="/orders" style={{ color: "var(--color-brand)" }}>
            <span className="inline-flex items-center gap-1.5"><ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.8} />Back to orders</span>
          </Link>
        </p>
      </div>
    );
  }

  // Find the intent_diff check and extract its details
  const intentDiffCheck = order.checks.find((c) => c.step === "intent_diff");
  const intentDiff =
    intentDiffCheck?.details &&
    "items" in (intentDiffCheck.details as object)
      ? (intentDiffCheck.details as IntentDiffDetails)
      : null;

  return (
    <div className="max-w-4xl w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Order {order.id.slice(-6).toUpperCase()}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {merchantName(order.merchant)} · {fmtTime(order.created_at)}
          </p>
          <p className="mt-0.5 font-mono text-xs text-fg-dim">{order.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <OrderStatusTag status={order.status} />
          <span className="text-lg font-semibold tabular-nums">{money(order.total, order.currency)}</span>
        </div>
      </div>

      {order.status === "awaiting_payment" && order.pay_url && (
        <div className="saas-card px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Approve the payment in PayPal</div>
            <p className="mt-0.5 text-xs text-fg-muted">
              PayPal holds the money while Sepilo checks the order, then charges or releases it. After this
              first approval your agent pays on its own.
            </p>
          </div>
          <a href={order.pay_url} className="intentlock-btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0">
            <Wallet className="w-4 h-4" strokeWidth={1.8} />
            Pay with PayPal
          </a>
        </div>
      )}

      {/* Approval panel (shown first if pending) */}
      {order.status === "pending_approval" && (
        <ApprovalPanel
          orderId={order.id}
          approval={order.approval}
          onApprovalDone={loadOrder}
        />
      )}

      {/* Line items (never only a total) */}
      {order.cart.length > 0 && (
        <LineItemsTable cart={order.cart} intentDiff={intentDiff} />
      )}

      {/* Checks timeline */}
      <ChecksTimeline checks={order.checks} />

      {/* Decision */}
      <DecisionPanel decision={order.decision} reasons={order.reasons ?? []} />

      {/* Approval panel for decided orders */}
      {order.status !== "pending_approval" && (
        <ApprovalPanel
          orderId={order.id}
          approval={order.approval}
          onApprovalDone={loadOrder}
        />
      )}

      {/* Proof link */}
      <div
        className="rounded-lg border px-5 py-4"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <Link
          href={`/proof/${order.id}`}
          className="text-sm font-medium"
          style={{ color: "var(--color-brand)", textDecoration: "underline" }}
        >
          View Proof of Intent
        </Link>
        <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
          Cryptographically signed audit trail for this order.
        </p>
      </div>
    </div>
  );
}
