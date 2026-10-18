/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getOrders, ApiError } from "@/lib/api";
import { getOrderStatusStyle } from "@/lib/status";
import { SkeletonRow } from "@/components/Skeleton";
import type { Order, OrderStatus } from "@/lib/types";
import WalletNav from "@/components/wallet/WalletNav";

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

function StatusChip({ status }: { status: OrderStatus }) {
  const style = getOrderStatusStyle(status);
  const textColor = style.chipTextHex ?? style.hex;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-mono font-semibold uppercase"
      style={{ background: style.hex + "20", color: textColor, border: `1px solid ${style.hex}40` }}
    >
      {style.label}
    </span>
  );
}

function OrderRow({ order }: { order: Order }) {
  return (
    <li>
      <Link
        href={`/wallet/orders/${order.id}`}
        className="block saas-card p-4 transition-all duration-150 hover:border-indigo-500/40"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: ID, merchant, agent */}
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                {order.id}
              </span>
              <StatusChip status={order.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
              <span>Merchant: <strong className="text-slate-800 dark:text-slate-200">{order.merchant}</strong></span>
              {order.agent_id && (
                <span>Agent: <span className="font-mono text-slate-800 dark:text-slate-200">{order.agent_id}</span></span>
              )}
            </div>
          </div>

          {/* Right: total + time */}
          <div className="text-right shrink-0 space-y-1">
            {order.total && (
              <div className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                ${order.total} {order.currency ?? "USD"}
              </div>
            )}
            <div className="text-xs text-slate-400">
              {fmtTime(order.created_at)}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

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

  useEffect(() => {
    if (!isChecking(orders)) return;
    const timer = setInterval(() => setRetryKey((k) => k + 1), 2000);
    return () => clearInterval(timer);
  }, [orders]);

  const pendingApprovals = orders.filter((o) => o.status === "pending_approval");

  return (
    <div className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Orders & Settlement Ledger
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Real-time audit log of autonomous checkout requests and human approval holds.
            {isChecking(orders) && (
              <span className="text-gray-900 font-medium">
                {" "}• Pipeline in progress, auto-refreshing...
              </span>
            )}
          </p>
        </div>
        <Link
          href="/wallet/request"
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition shadow-xs"
        >
          + Create Intent Request
        </Link>
      </div>

      <WalletNav />

      {/* Pending Approvals Notice if any exist */}
      {pendingApprovals.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 dark:bg-amber-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="saas-badge saas-badge-warning font-semibold">
              Action Required
            </span>
            <span className="text-xs text-amber-800 dark:text-amber-200">
              You have <strong>{pendingApprovals.length}</strong> purchase hold(s) awaiting review within the 30-minute approval window.
            </span>
          </div>
        </div>
      )}

      {loading && (
        <ul className="space-y-3" aria-label="Loading orders">
          {[1, 2, 3].map((i) => (
            <li key={i}><SkeletonRow /></li>
          ))}
        </ul>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button
            className="text-xs font-semibold underline"
            onClick={retry}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <div className="saas-card p-8 text-center">
          <p className="text-sm text-slate-500">
            No checkout transactions recorded yet.
          </p>
          <div className="mt-3 flex justify-center gap-3 text-xs">
            <Link href="/wallet/request" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
              Submit Intent Request &rarr;
            </Link>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <Link href="/lab" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
              Run Attack Lab Scenario &rarr;
            </Link>
          </div>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <ul className="space-y-3">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}
