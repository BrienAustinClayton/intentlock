"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, Pencil, ShieldCheck, ShieldPlus, X } from "lucide-react";
import { Chip, FormError, inputClass } from "@/components/auth/AuthFrame";
import {
  CATEGORIES,
  EmptyState,
  ErrorNote,
  PageHeader,
  Panel,
  SkeletonRows,
  Tag,
  categoryName,
  merchantName,
  money,
  rowClass,
  tableClass,
  td,
  th,
  theadClass,
} from "@/components/ui";
import { me, type RuleInput } from "@/lib/me";
import type { Agent, BudgetPeriod, Mandate } from "@/lib/types";

const PERIODS: [BudgetPeriod, string][] = [
  ["month", "Per month"],
  ["week", "Per week"],
  ["once", "Single purchase"],
];
const periodLabel = (p: BudgetPeriod) => PERIODS.find(([v]) => v === p)?.[1].toLowerCase() ?? p;

type Form = {
  agent_id: string;
  budget: string;
  period: BudgetPeriod;
  categories: string[];
  stores: "any" | "only";
  storeText: string;
  expires: string;
};
const blank = (agentId = ""): Form => ({
  agent_id: agentId, budget: "", period: "month", categories: [], stores: "any", storeText: "", expires: "",
});
const DOMAIN = /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?\.[a-z]{2,}$/;
const parseStores = (t: string) =>
  [...new Set(t.split(/[\s,]+/).map((x) => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(Boolean))];

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function status(m: Mandate) {
  if (m.revoked_at) return <Tag tone="neutral">Ended</Tag>;
  if (m.expires_at && new Date(m.expires_at) < new Date()) return <Tag tone="neutral">Expired</Tag>;
  return (
    <Tag tone="success" dot>
      Active
    </Tag>
  );
}

export default function RulesPage() {
  const [rules, setRules] = useState<Mandate[] | null>(null);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([me.rules(), me.agents()]).then(
      ([r, a]) => {
        setRules(r);
        setAgents(a);
        // The chat's rule picker links here with ?new=1 to open a blank rule straight away.
        const first = a.find((x) => !x.revoked_at);
        if (first && new URLSearchParams(window.location.search).get("new") === "1") {
          setForm(blank(a.find((x) => x.managed && !x.revoked_at)?.id ?? first.id));
          setEditing("new");
        }
      },
      (e: Error) => setLoadError(e.message),
    );
  }, []);

  const active = (agents ?? []).filter((a) => !a.revoked_at);
  const agentName = (id: string) => agents?.find((a) => a.id === id)?.name ?? id;

  function openNew() {
    setForm(blank(active[0]?.id));
    setError(null);
    setEditing("new");
  }

  function openEdit(m: Mandate) {
    setForm({
      agent_id: m.agent_id,
      budget: m.budget_amount,
      period: m.budget_period,
      categories: [...m.categories],
      stores: m.merchants.includes("*") ? "any" : "only",
      storeText: m.merchants.filter((x) => x !== "*").join(", "),
      expires: m.expires_at ? m.expires_at.slice(0, 10) : "",
    });
    setError(null);
    setEditing(m.id);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(form.budget) || Number(form.budget) <= 0) return setError("Enter a budget greater than 0.");
    if (!form.categories.length) return setError("Pick at least one category.");
    const stores = form.stores === "any" ? ["*"] : parseStores(form.storeText);
    if (!stores.length) return setError("Add at least one store, e.g. walmart.com, or allow any store.");
    const badStore = stores.find((x) => x !== "*" && !DOMAIN.test(x));
    if (badStore) return setError(`"${badStore}" isn't a store website. Use a domain like walmart.com.`);
    setBusy(true);
    setError(null);
    const body: RuleInput = {
      agent_id: form.agent_id || active[0]?.id || "",
      categories: form.categories,
      merchants: stores,
      budget_amount: Number(form.budget).toFixed(2),
      budget_period: form.period,
      currency: "USD",
      expires_at: form.expires ? new Date(`${form.expires}T23:59:59`).toISOString() : null,
    };
    try {
      const saved = editing === "new" ? await me.createRule(body) : await me.updateRule(editing as string, body);
      setRules((r) => (editing === "new" ? [saved, ...(r ?? [])] : (r ?? []).map((x) => (x.id === saved.id ? saved : x))));
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function end(m: Mandate) {
    if (!window.confirm("End this rule? The agent will no longer be able to buy under it.")) return;
    try {
      const updated = await me.endRule(m.id);
      setRules((r) => (r ?? []).map((x) => (x.id === m.id ? updated : x)));
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }

  const noAgents = agents !== null && active.length === 0;

  return (
    <div>
      <PageHeader
        title="Spending rules"
        description="What each agent may buy, where, and how much. Orders outside a rule are blocked or held for you. Rules are signed, so they can't be changed silently."
        actions={
          editing === null &&
          !noAgents && (
            <button type="button" onClick={openNew} className="intentlock-btn-primary">
              <ShieldPlus className="w-4 h-4" strokeWidth={1.8} />
              New rule
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
            body="A spending rule belongs to one agent. Connect the agent that shops for you, then set its limits here."
            action={
              <Link href="/agents" className="intentlock-btn-primary btn-sm">
                Connect an agent
              </Link>
            }
          />
        </Panel>
      )}

      {editing !== null && (
        <Panel className="mb-5">
          <form onSubmit={save} className="p-5 space-y-5">
            <div className="flex items-start justify-between">
              <h2 className="text-sm font-semibold">{editing === "new" ? "New spending rule" : "Edit spending rule"}</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="p-1 rounded-md text-fg-dim hover:text-fg hover:bg-fg/5">
                <X className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium text-fg-2">Agent</span>
                <select value={form.agent_id || active[0]?.id || ""} onChange={(e) => setForm({ ...form, agent_id: e.target.value })} className={inputClass}>
                  {active.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium text-fg-2">Budget (USD)</span>
                <input
                  inputMode="decimal"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value.replace(/[^\d.]/g, "") })}
                  className={inputClass}
                  placeholder="200.00"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium text-fg-2">Resets</span>
                <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as BudgetPeriod })} className={inputClass}>
                  {PERIODS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="space-y-2">
              <span className="block text-[13px] font-medium text-fg-2">Allowed categories</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORIES).map(([v, l]) => (
                  <Chip key={v} label={l} selected={form.categories.includes(v)} onClick={() => setForm({ ...form, categories: toggle(form.categories, v) })} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <span className="block text-[13px] font-medium text-fg-2">Allowed stores</span>
              <div className="segmented max-w-xs">
                {(["any", "only"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={form.stores === v} data-on={form.stores === v} onClick={() => setForm({ ...form, stores: v })}>
                    {v === "any" ? "Any store" : "Only these stores"}
                  </button>
                ))}
              </div>
              {form.stores === "only" ? (
                <input
                  value={form.storeText}
                  onChange={(e) => setForm({ ...form, storeText: e.target.value })}
                  className={inputClass}
                  placeholder="walmart.com, target.com, bestbuy.com"
                />
              ) : (
                <span className="block text-xs text-fg-dim">
                  Your agent can buy from any store Channel3 lists. Every order is still checked before payment.
                </span>
              )}
            </div>
            <label className="block space-y-1.5 max-w-xs">
              <span className="block text-[13px] font-medium text-fg-2">Ends on</span>
              <input type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} className={inputClass} />
              <span className="block text-xs text-fg-dim">Optional. Leave empty to keep the rule until you end it.</span>
            </label>
            <p className="text-xs text-fg-dim">Channel3 prices are in US dollars, so budgets are in USD.</p>
            <FormError message={error} />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy} className="intentlock-btn-primary">
                {busy ? "Signing…" : editing === "new" ? "Create rule" : "Save changes"}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="intentlock-btn-outline">
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}

      {!noAgents && (
        <Panel>
          {rules && rules.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No spending rules yet"
              body="Without a rule, every checkout from your agent is rejected. Add one to say what it may buy and how much it may spend."
            />
          ) : (
            <>
            {rules && (
              <ul className="sm:hidden divide-y divide-line">
                {rules.map((m) => (
                  <li key={m.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg truncate">{agentName(m.agent_id)}</span>
                      {status(m)}
                    </div>
                    <div className="text-sm">
                      <span className="tabular-nums text-fg">{money(m.budget_amount, m.currency)}</span>
                      <span className="text-fg-dim"> {periodLabel(m.budget_period)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {m.categories.map((c) => (
                        <Tag key={c}>{categoryName(c)}</Tag>
                      ))}
                      {m.merchants.map((c) => (
                        <Tag key={c} tone="brand">
                          {merchantName(c)}
                        </Tag>
                      ))}
                    </div>
                    {!m.revoked_at && (
                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => openEdit(m)} className="intentlock-btn-outline btn-sm flex-1">
                          Edit
                        </button>
                        <button type="button" onClick={() => end(m)} className="intentlock-btn-outline btn-sm flex-1">
                          End
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className={`${rules ? "hidden sm:block" : ""} overflow-x-auto`}>
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={th}>Agent</th>
                    <th className={th}>Budget</th>
                    <th className={th}>Categories</th>
                    <th className={th}>Stores</th>
                    <th className={th}>Status</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {!rules ? (
                    <SkeletonRows rows={2} cols={6} />
                  ) : (
                    rules.map((m) => (
                      <tr key={m.id} className={rowClass}>
                        <td className={`${td} text-fg font-medium`}>{agentName(m.agent_id)}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          <span className="tabular-nums text-fg">{money(m.budget_amount, m.currency)}</span>
                          <span className="text-fg-dim"> {periodLabel(m.budget_period)}</span>
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap gap-1">
                            {m.categories.map((c) => (
                              <Tag key={c}>{categoryName(c)}</Tag>
                            ))}
                          </div>
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap gap-1">
                            {m.merchants.map((c) => (
                              <Tag key={c} tone="brand">
                                {merchantName(c)}
                              </Tag>
                            ))}
                          </div>
                        </td>
                        <td className={td}>{status(m)}</td>
                        <td className={`${td} text-right whitespace-nowrap`}>
                          {!m.revoked_at && (
                            <div className="inline-flex gap-1.5">
                              <button type="button" onClick={() => openEdit(m)} className="intentlock-btn-outline btn-sm" aria-label="Edit rule">
                                <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                                Edit
                              </button>
                              <button type="button" onClick={() => end(m)} className="intentlock-btn-outline btn-sm">
                                End
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
