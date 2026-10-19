"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Circle, CircleCheck, MessageSquarePlus, Receipt, TriangleAlert } from "lucide-react";
import {
  EmptyState,
  ErrorNote,
  OrderStatusTag,
  Panel,
  SkeletonRows,
  merchantName,
  money,
  rowClass,
  tableClass,
  td,
  th,
  theadClass,
  when,
} from "@/components/ui";
import { me as meApi, type Summary } from "@/lib/me";
import { useMe } from "@/lib/useMe";

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="saas-card p-5">
      <div className="text-xs font-medium text-fg-dim">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-fg-dim">{hint}</div>
    </div>
  );
}

export default function HomePage() {
  const me = useMe();
  const [s, setS] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    meApi.summary().then(setS, (e: Error) => setError(e.message));
  }, []);

  const steps = s
    ? [
        { done: s.payment_connected, label: "Connect a payment method", body: "IntentLock holds funds and only pays once checks pass.", href: "/payment" },
        { done: s.agents_active > 0, label: "Create your shopping agent", body: "IntentLock runs it for you, or connect an agent you already use.", href: "/agents" },
        { done: s.rules_active > 0, label: "Set a spending rule", body: "Budget, categories and stores your agent is allowed to use.", href: "/rules" },
        { done: s.requests > 0, label: "Send a purchase request", body: "Tell your agent what to buy. We check every order against it.", href: "/requests" },
      ]
    : [];
  const setupLeft = steps.filter((x) => !x.done).length;
  const first = me?.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{first ? `Welcome back, ${first}` : "Welcome back"}</h1>
          <p className="text-sm text-fg-muted">What your agents bought this month, and what IntentLock stopped.</p>
        </div>
        <Link href="/requests?new=1" className="intentlock-btn-primary">
          <MessageSquarePlus className="w-4 h-4" strokeWidth={1.8} />
          New purchase request
        </Link>
      </div>

      <ErrorNote message={error} />

      {s && s.needs_approval > 0 && (
        <div className="saas-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-amber-500/30">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <TriangleAlert className="w-4 h-4" strokeWidth={1.8} />
            </span>
            <div>
              <div className="text-sm font-medium">
                {s.needs_approval === 1 ? "1 order is waiting for you" : `${s.needs_approval} orders are waiting for you`}
              </div>
              <div className="text-xs text-fg-muted">Funds are on hold. Nothing is charged until you approve.</div>
            </div>
          </div>
          <Link href="/orders?view=needs_approval" className="intentlock-btn-outline btn-sm">
            Review
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.8} />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Orders" value={s ? String(s.month.orders) : "–"} hint="Checked this month" />
        <Stat label="Paid" value={s ? String(s.month.paid) : "–"} hint="Passed every check" />
        <Stat label="Blocked" value={s ? String(s.month.blocked) : "–"} hint="Stopped before payment" />
        <Stat label="Spent" value={s ? money(s.month.spent, s.currency) : "–"} hint="Captured this month" />
      </div>

      {s && setupLeft > 0 && (
        <Panel>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Finish setting up</h2>
              <p className="text-xs text-fg-muted">
                {setupLeft === 1 ? "1 step left" : `${setupLeft} steps left`} before your agent can shop safely.
              </p>
            </div>
          </div>
          <ul className="border-t border-line">
            {steps.map((st) => (
              <li key={st.label} className="border-b border-line last:border-0">
                <Link href={st.href} className="flex items-center gap-3 px-5 py-3 hover:bg-fg/[0.025] transition">
                  {st.done ? (
                    <CircleCheck className="w-[18px] h-[18px] text-emerald-400 shrink-0" strokeWidth={1.8} />
                  ) : (
                    <Circle className="w-[18px] h-[18px] text-fg-faint shrink-0" strokeWidth={1.8} />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm ${st.done ? "text-fg-dim line-through" : "text-fg font-medium"}`}>{st.label}</span>
                    {!st.done && <span className="block text-xs text-fg-muted">{st.body}</span>}
                  </span>
                  {!st.done && <ArrowRight className="w-4 h-4 text-fg-dim" strokeWidth={1.8} />}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        <div className="px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent orders</h2>
          <Link href="/orders" className="text-xs text-fg-muted hover:text-fg transition">
            View all
          </Link>
        </div>
        {s && s.recent_orders.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState
              icon={Receipt}
              title="No orders yet"
              body="When your agent checks out, the order and every check IntentLock ran on it show up here."
            />
          </div>
        ) : (
          <table className={tableClass}>
            <thead className={`${theadClass} border-t`}>
              <tr>
                <th className={th}>Order</th>
                <th className={th}>Store</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={th}>Status</th>
                <th className={th}>When</th>
              </tr>
            </thead>
            <tbody>
              {!s ? (
                <SkeletonRows rows={3} cols={5} />
              ) : (
                s.recent_orders.map((o) => (
                  <tr key={o.id} className={`${rowClass} cursor-pointer`}>
                    <td className={td}>
                      <Link href={`/orders/${o.id}`} className="font-mono text-xs text-fg hover:text-blue-400">
                        {o.id.slice(-6).toUpperCase()}
                      </Link>
                    </td>
                    <td className={td}>{merchantName(o.merchant)}</td>
                    <td className={`${td} text-right tabular-nums text-fg`}>{money(o.total, o.currency)}</td>
                    <td className={td}>
                      <OrderStatusTag status={o.status} />
                    </td>
                    <td className={`${td} text-fg-dim`}>{when(o.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
