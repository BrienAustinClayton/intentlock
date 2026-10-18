"use client";

import { useEffect, useState } from "react";
import { Bot, Copy, Check, Plug, X } from "lucide-react";
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
import { me } from "@/lib/me";
import type { Agent } from "@/lib/types";

function CopyId({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value).then(() => (setDone(true), setTimeout(() => setDone(false), 1200)))}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-fg-2 hover:text-fg transition"
      title="Copy agent ID"
    >
      {value}
      {done ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-fg-dim" />}
    </button>
  );
}

export default function AgentsPage() {
  const [rows, setRows] = useState<Agent[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [device, setDevice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    me.agents().then(setRows, (e: Error) => setLoadError(e.message));
  }, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const a = await me.connectAgent({ name: name.trim(), public_key: key.trim(), device_id: device.trim() });
      setRows((r) => [a, ...(r ?? [])]);
      setName("");
      setKey("");
      setDevice("");
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(a: Agent) {
    if (!window.confirm(`Disconnect ${a.name}? It will no longer be able to check out on your behalf.`)) return;
    try {
      const updated = await me.revokeAgent(a.id);
      setRows((r) => (r ?? []).map((x) => (x.id === a.id ? updated : x)));
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Agents"
        description="AI agents allowed to shop for you. Each one signs its checkouts with a private key; IntentLock verifies the signature with the public key you register here."
        actions={
          !open && (
            <button type="button" onClick={() => setOpen(true)} className="intentlock-btn-primary">
              <Plug className="w-4 h-4" strokeWidth={1.8} />
              Connect agent
            </button>
          )
        }
      />

      <ErrorNote message={loadError} />

      {open && (
        <Panel className="mb-5">
          <form onSubmit={connect} className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold">Connect an agent</h2>
                <p className="text-xs text-fg-muted">
                  Paste the agent&apos;s Ed25519 public key (base64url, 43 characters). The private key never leaves the agent.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded-md text-fg-dim hover:text-fg hover:bg-fg/5">
                <X className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium text-fg-2">Name</span>
                <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Grocery agent" />
              </label>
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium text-fg-2">Device or host</span>
                <input maxLength={128} value={device} onChange={(e) => setDevice(e.target.value)} className={inputClass} placeholder="Optional, e.g. home server" />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-fg-2">Public key</span>
              <input
                required
                maxLength={64}
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder="e.g. URqKaWEmT2Olwb7Ua0lt50hRaDVrbWpl_Mg3ceRJ1BI"
              />
            </label>
            <FormError message={error} />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy || !name.trim() || !key.trim()} className="intentlock-btn-primary">
                {busy ? "Connecting…" : "Connect"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="intentlock-btn-outline">
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel>
        {rows && rows.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No agents connected"
            body="Connect the AI agent that shops for you. Until then, IntentLock rejects every checkout because no signature can be verified."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Agent ID</th>
                  <th className={th}>Status</th>
                  <th className={th}>Device</th>
                  <th className={th}>Connected</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {!rows ? (
                  <SkeletonRows rows={2} cols={6} />
                ) : (
                  rows.map((a) => (
                    <tr key={a.id} className={rowClass}>
                      <td className={`${td} text-fg font-medium`}>{a.name}</td>
                      <td className={td}>
                        <CopyId value={a.id} />
                      </td>
                      <td className={td}>
                        {a.revoked_at ? <Tag tone="neutral">Disconnected</Tag> : <Tag tone="success" dot>Active</Tag>}
                      </td>
                      <td className={`${td} text-fg-dim`}>{a.device_id === "unspecified" ? "" : a.device_id}</td>
                      <td className={`${td} text-fg-dim whitespace-nowrap`}>{when(a.created_at)}</td>
                      <td className={`${td} text-right`}>
                        {!a.revoked_at && (
                          <button type="button" onClick={() => disconnect(a)} className="intentlock-btn-outline btn-sm">
                            Disconnect
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
