"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, Loader2, MessageSquarePlus, MessageSquareText, RotateCw, X } from "lucide-react";
import { FormError, inputClass } from "@/components/auth/AuthFrame";
import {
  EmptyState,
  ErrorNote,
  OrderStatusTag,
  PageHeader,
  Panel,
  SkeletonRows,
  Tag,
  rowClass,
  tableClass,
  td,
  th,
  theadClass,
  when,
} from "@/components/ui";
import { me, type MyAgent, type PurchaseRequest } from "@/lib/me";

const EXAMPLES = [
  "2 litres of organic whole milk and a sourdough loaf, under $15",
  "A 1 m USB-C to USB-C charging cable, braided, under $20",
  "Weekly groceries: eggs, bananas, greek yogurt",
];

export default function RequestsClient() {
  const params = useSearchParams();
  const [rows, setRows] = useState<PurchaseRequest[] | null>(null);
  const [agents, setAgents] = useState<MyAgent[] | null>(null);
  const [open, setOpen] = useState(params.get("new") === "1");
  const [agentId, setAgentId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [why, setWhy] = useState<PurchaseRequest | null>(null);
  const shopping = rows?.some((r) => r.run?.status === "running") ?? false;

  useEffect(() => {
    if (!shopping) return;
    const t = setInterval(() => {
      me.requests().then(setRows, () => {});
    }, 4000);
    return () => clearInterval(t);
  }, [shopping]);

  async function retry(r: PurchaseRequest) {
    try {
      const run = await me.runRequest(r.id);
      setRows((rs) => (rs ?? []).map((x) => (x.id === r.id ? { ...x, run } : x)));
      setWhy(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }

  function status(r: PurchaseRequest) {
    const run = r.run;
    if (run?.status === "running") {
      return (
        <Tag tone="brand">
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
          Agent shopping
        </Tag>
      );
    }
    if (run?.status === "ordered" && run.order_id && run.order_status) {
      return (
        <Link href={`/orders/${run.order_id}`} title="Open order">
          <OrderStatusTag status={run.order_status} />
        </Link>
      );
    }
    if (run?.status === "failed") {
      return (
        <span className="inline-flex items-center gap-2">
          <Tag tone="danger">Failed</Tag>
          <button type="button" onClick={() => setWhy(r)} className="text-xs text-indigo-400 hover:text-indigo-300 transition">
            See why
          </button>
        </span>
      );
    }
    if (r.orders > 0) {
      return (
        <Link href="/orders">
          <Tag tone="success">{r.orders === 1 ? "1 order" : `${r.orders} orders`}</Tag>
        </Link>
      );
    }
    if (r.agent_managed) {
      return (
        <button type="button" onClick={() => retry(r)} className="intentlock-btn-outline btn-sm">
          Run now
        </button>
      );
    }
    return (
      <span title="This agent runs on your side. IntentLock can't start it; it picks the request up when it checks in.">
        <Tag tone="neutral">Waiting for your agent</Tag>
      </span>
    );
  }

  useEffect(() => {
    Promise.all([me.requests(), me.agents()]).then(
      ([r, a]) => {
        setRows(r);
        const active = a.filter((x) => !x.revoked_at).sort((x, y) => Number(y.managed) - Number(x.managed));
        setAgents(active);
        if (active[0]) setAgentId(active[0].id);
      },
      (e: Error) => setLoadError(e.message),
    );
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await me.createRequest({ agent_id: agentId || agents?.[0]?.id || "", request_text: text.trim() });
      setRows((r) => [created, ...(r ?? [])]);
      setText("");
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const noAgents = agents !== null && agents.length === 0;

  return (
    <div>
      <PageHeader
        title="Purchase requests"
        description="Tell your agent what to buy. Hosted agents start shopping right away; every order is checked against your request before anything is paid."
        actions={
          !open &&
          !noAgents && (
            <button type="button" onClick={() => setOpen(true)} className="intentlock-btn-primary">
              <MessageSquarePlus className="w-4 h-4" strokeWidth={1.8} />
              New request
            </button>
          )
        }
      />

      <ErrorNote message={loadError} />

      {noAgents && (
        <Panel className="mb-5">
          <EmptyState
            icon={Bot}
            title="Connect an agent first"
            body="A purchase request is addressed to one of your agents. Connect the agent that shops for you, then come back."
            action={
              <Link href="/agents" className="intentlock-btn-primary btn-sm">
                Connect an agent
              </Link>
            }
          />
        </Panel>
      )}

      {open && !noAgents && (
        <Panel className="mb-5">
          <form onSubmit={submit} className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold">New purchase request</h2>
                <p className="text-xs text-fg-muted">Be specific about item, size, quantity and price. That is what we check against.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded-md text-fg-dim hover:text-fg hover:bg-fg/5">
                <X className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-fg-2">What should your agent buy?</span>
              <textarea
                required
                autoFocus
                minLength={3}
                maxLength={2000}
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className={`${inputClass} !h-auto py-2.5 resize-y`}
                placeholder={EXAMPLES[0]}
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setText(ex)}
                  className="px-2.5 py-1 rounded-lg text-xs text-fg-muted bg-fg/[0.04] hover:bg-fg/[0.08] hover:text-fg transition"
                >
                  {ex}
                </button>
              ))}
            </div>
            <label className="block space-y-1.5 max-w-sm">
              <span className="block text-[13px] font-medium text-fg-2">Agent</span>
              <select value={agentId || agents?.[0]?.id || ""} onChange={(e) => setAgentId(e.target.value)} className={inputClass}>
                {(agents ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.managed ? "(hosted by IntentLock)" : "(your own)"}
                  </option>
                ))}
              </select>
              {(() => {
                const picked = agents?.find((a) => a.id === (agentId || agents?.[0]?.id));
                return picked && !picked.managed ? (
                  <span className="block text-xs text-amber-400">
                    IntentLock can&apos;t start this agent: it runs on your side with your own key. The request waits until
                    your agent picks it up. Use a hosted agent to have IntentLock shop right away.
                  </span>
                ) : null;
              })()}
            </label>
            <FormError message={error} />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy || text.trim().length < 3 || !(agentId || agents?.[0]?.id)} className="intentlock-btn-primary">
                {busy ? "Sending…" : "Send to agent"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="intentlock-btn-outline">
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      {!noAgents && (
        <Panel>
          {rows && rows.length === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title="No purchase requests yet"
              body="Each request is signed by IntentLock and sent to your agent. Every checkout it makes is compared with what you asked for."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={th}>Request</th>
                    <th className={th}>Agent</th>
                    <th className={th}>Status</th>
                    <th className={th}>Request ID</th>
                    <th className={th}>Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {!rows ? (
                    <SkeletonRows rows={4} cols={5} />
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className={rowClass}>
                        <td className={`${td} text-fg max-w-[420px]`}>
                          <span className="line-clamp-2">{r.request_text}</span>
                        </td>
                        <td className={td}>{r.agent_name ?? r.agent_id}</td>
                        <td className={`${td} whitespace-nowrap`}>{status(r)}</td>
                        <td className={`${td} font-mono text-xs text-fg-dim`}>{r.id}</td>
                        <td className={`${td} text-fg-dim whitespace-nowrap`}>{when(r.signed_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      {why && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="why-title">
          <button type="button" aria-label="Close" onClick={() => setWhy(null)} className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <div className="popover relative w-full max-w-lg p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="why-title" className="text-sm font-semibold">Why this request failed</h2>
                <p className="text-xs text-fg-muted">
                  {why.agent_name ?? "Your agent"} · {when(why.run?.finished_at ?? why.run?.started_at)}
                </p>
              </div>
              <button type="button" onClick={() => setWhy(null)} aria-label="Close" className="p-1 rounded-md text-fg-dim hover:text-fg hover:bg-fg/5">
                <X className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-fg-dim">You asked for</div>
              <p className="text-sm text-fg-2">{why.request_text}</p>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-fg-dim">The agent said</div>
              <p className="text-sm text-fg whitespace-pre-wrap rounded-lg bg-fg/[0.04] px-3 py-2.5">
                {why.run?.summary || "The agent didn't give a reason."}
              </p>
            </div>
            {why.run && why.run.errors.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-fg-dim">Errors</div>
                <ul className="text-xs text-rose-400 space-y-1 font-mono">
                  {why.run.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-fg-dim">
              Agents can only buy from the IntentLock store catalog: groceries, electronics accessories and gift cards.
              Rephrasing the request or widening your spending rules can help.
            </p>
            <div className="flex items-center gap-2">
              {why.agent_managed && (
                <button type="button" onClick={() => retry(why)} className="intentlock-btn-primary btn-sm">
                  <RotateCw className="w-3.5 h-3.5" strokeWidth={1.8} />
                  Try again
                </button>
              )}
              <button type="button" onClick={() => setWhy(null)} className="intentlock-btn-outline btn-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
