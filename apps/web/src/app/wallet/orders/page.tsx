/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getOrders, ApiError } from "@/lib/api";
import { getOrderStatusStyle } from "@/lib/status";
import { SkeletonRow } from "@/components/Skeleton";
import type { Order, OrderStatus } from "@/lib/types";

const DEMO_USER_ID = "usr_demo_priya";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(dt: string): string {
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

function isChecking(orders: Order[]): boolean {
  return orders.some((o) => o.status === "checking" || o.status === "authorized" || o.status === "received");
}

// ---------------------------------------------------------------------------
// StatusChip
// ---------------------------------------------------------------------------

function StatusChip({ status }: { status: OrderStatus }) {
  const style = getOrderStatusStyle(status);
  const textColor = style.chipTextHex ?? style.hex;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: style.hex + "22", color: textColor }}
    >
      {style.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// OrderRow
// ---------------------------------------------------------------------------

function OrderRow({ order }: { order: Order }) {
  return (
    <li>
      <Link
        href={`/wallet/orders/${order.id}`}
        className="block rounded-lg border px-5 py-4 transition-colors hover:border-current"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-surface)",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* Left: ID, merchant, agent */}
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-mono text-sm font-semibold truncate"
                style={{ color: "var(--color-text)" }}
              >
                {order.id}
              </span>
              <StatusChip status={order.status} />
            </div>
            <div className="text-xs space-x-3" style={{ color: "var(--color-text-muted)" }}>
              <span>Merchant: <strong style={{ color: "var(--color-text)" }}>{order.merchant}</strong></span>
              {order.agent_id && (
                <span>Agent: <span className="font-mono">{order.agent_id}</span></span>
              )}
            </div>
          </div>

          {/* Right: total + time */}
          <div className="text-right shrink-0 space-y-1">
            {order.total && (
              <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                {order.currency ?? "USD"} {order.total}
              </div>
            )}
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {fmtTime(order.created_at)}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// WalletOrdersPage
// ---------------------------------------------------------------------------

export default function WalletOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getOrders({ user_id: DEMO_USER_ID })
      .then((data) => {
        if (!active) return;
        setOrders(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 0 && err.code === "config_error") {
          setError("API is not configured (NEXT_PUBLIC_API_URL missing).");
        } else {
          setError(err instanceof Error ? err.message : "Failed to load orders.");
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [retryKey]);

  // Auto-refresh every 2 s while any order is in a transitional status
  useEffect(() => {
    if (!isChecking(orders)) return;
    const timer = setInterval(() => setRetryKey((k) => k + 1), 2000);
    return () => clearInterval(timer);
  }, [orders]);

  return (
    <div className="mx-auto max-w-3xl w-full px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "var(--color-text)" }}>
            Orders
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            All orders for demo user Priya.
            {isChecking(orders) && (
              <span style={{ color: "var(--color-status-checking)" }}>
                {" "}Auto-refreshing...
              </span>
            )}
          </p>
        </div>
        <Link href="/wallet/request" className="intentlock-btn-primary" style={{ textDecoration: "none" }}>
          + New Request
        </Link>
      </div>

      {loading && (
        <ul className="space-y-3" aria-label="Loading orders">
          {[1, 2, 3].map((i) => (
            <li key={i}><SkeletonRow /></li>
          ))}
        </ul>
      )}

      {error && (
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
            <span>{error}</span>
            <button
              className="intentlock-btn-outline"
              style={{
                fontSize: "0.75rem",
                padding: "0.25rem 0.75rem",
                color: "var(--color-status-voided)",
                borderColor: "var(--color-status-voided)",
              }}
              onClick={retry}
              aria-label="Retry loading orders"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No orders yet.{" "}
          <Link href="/wallet/request" style={{ color: "var(--color-brand)" }}>
            Create a new request
          </Link>{" "}
          or run a{" "}
          <Link href="/lab" style={{ color: "var(--color-brand)" }}>
            lab scenario
          </Link>
          .
        </p>
      )}

      {!loading && (
        <ul className="space-y-3">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}
