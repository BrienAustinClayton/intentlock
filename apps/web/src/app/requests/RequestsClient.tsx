"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, MessageSquarePlus, MessageSquareText, X } from "lucide-react";
import { FormError, inputClass } from "@/components/auth/AuthFrame";
import {
  EmptyState,
  ErrorNote,
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
import { me, type PurchaseRequest } from "@/lib/me";
import type { Agent } from "@/lib/types";

const EXAMPLES = [
  "2 litres of organic whole milk and a sourdough loaf, under $15",
  "A 1 m USB-C to USB-C charging cable, braided, under $20",
  "Weekly groceries: eggs, bananas, greek yogurt",
];

export default function RequestsClient() {
  const params = useSearchParams();
  const [rows, setRows] = useState<PurchaseRequest[] | null>(null);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [open, setOpen] = useState(params.get("new") === "1");
  const [agentId, setAgentId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([me.requests(), me.agents()]).then(
      ([r, a]) => {
        setRows(r);
        const active = a.filter((x) => !x.revoked_at);
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
        description="Tell your agent what to buy. IntentLock signs the request and checks every order your agent places against it."
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
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <FormError message={error} />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy || text.trim().length < 3 || !(agentId || agents?.[0]?.id)} className="intentlock-btn-primary">
                {busy ? "Signing…" : "Sign and send"}
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
              body="Each request you send is signed by IntentLock. Your agent fetches it, shops, and every checkout is compared with it."
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
                        <td className={td}>
                          {r.orders > 0 ? (
                            <Link href="/orders">
                              <Tag tone="success">{r.orders === 1 ? "1 order" : `${r.orders} orders`}</Tag>
                            </Link>
                          ) : (
                            <Tag tone="neutral">Waiting for agent</Tag>
                          )}
                        </td>
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
    </div>
  );
}
