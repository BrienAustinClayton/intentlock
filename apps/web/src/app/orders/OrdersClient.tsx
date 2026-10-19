"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import {
  EmptyState,
  ErrorNote,
  OrderCards,
  OrderStatusTag,
  PageHeader,
  Panel,
  SkeletonRows,
  merchantName,
  money,
  orderItems,
  rowClass,
  tableClass,
  td,
  th,
  theadClass,
  when,
} from "@/components/ui";
import { me, type OrderView } from "@/lib/me";
import type { Order } from "@/lib/types";

const VIEWS: { id: OrderView; label: string; empty: string }[] = [
  { id: "all", label: "All", empty: "When your agent checks out, each order shows up here with every check Secay ran." },
  { id: "needs_approval", label: "Needs approval", empty: "Nothing is waiting for you. Held orders appear here until you approve or decline." },
  { id: "paid", label: "Paid", empty: "No orders have been paid yet." },
  { id: "blocked", label: "Blocked", empty: "Nothing has been blocked. Orders that fail a check are stopped before payment." },
  { id: "in_progress", label: "Checking", empty: "No orders are being checked right now." },
];


export default function OrdersClient() {
  const router = useRouter();
  const params = useSearchParams();
  const view = (VIEWS.find((v) => v.id === params.get("view"))?.id ?? "all") as OrderView;
  const [rows, setRows] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    me.orders(view).then(
      (r) => live && (setRows(r), setError(null)),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
      setRows(null);
    };
  }, [view]);

  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every checkout your agents attempted. Secay holds the payment, runs its checks, then pays, blocks or asks you."
      />

      <div role="tablist" className="flex items-center gap-1 mb-4 border-b border-line overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={v.id === view}
            onClick={() => router.replace(v.id === "all" ? "/orders" : `/orders?view=${v.id}`)}
            className={`relative px-3 h-9 text-[13px] font-medium transition ${
              v.id === view ? "text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            {v.label}
            {v.id === view && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-blue-500" />}
          </button>
        ))}
      </div>

      <ErrorNote message={error} />

      <Panel>
        {rows && rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No orders here" body={current.empty} />
        ) : (
          <>
          {rows && <OrderCards orders={rows} />}
          <div className={`${rows ? "hidden sm:block" : ""} overflow-x-auto`}>
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={th}>Order</th>
                  <th className={th}>Items</th>
                  <th className={th}>Store</th>
                  <th className={`${th} text-right`}>Total</th>
                  <th className={th}>Status</th>
                  <th className={th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {!rows ? (
                  <SkeletonRows rows={5} cols={6} />
                ) : (
                  rows.map((o) => (
                    <tr key={o.id} onClick={() => router.push(`/orders/${o.id}`)} className={`${rowClass} cursor-pointer`}>
                      <td className={td}>
                        <Link href={`/orders/${o.id}`} className="font-mono text-xs text-fg hover:text-blue-400">
                          {o.id.slice(-6).toUpperCase()}
                        </Link>
                      </td>
                      <td className={`${td} max-w-[280px] truncate`}>{orderItems(o)}</td>
                      <td className={td}>{merchantName(o.merchant)}</td>
                      <td className={`${td} text-right tabular-nums text-fg`}>{money(o.total, o.currency)}</td>
                      <td className={td}>
                        <OrderStatusTag status={o.status} />
                      </td>
                      <td className={`${td} text-fg-dim whitespace-nowrap`}>{when(o.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Panel>
    </div>
  );
}
