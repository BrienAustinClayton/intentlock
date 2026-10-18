/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  getMandates,
  getAgentKeys,
  getVaultSetup,
  revokeAgent,
  createMandate,
  updateMandate,
  revokeMandate,
  ApiError,
} from "@/lib/api";
import type { Mandate, BudgetPeriod } from "@/lib/types";
import { SkeletonBlock } from "@/components/Skeleton";
import WalletNav from "./WalletNav";

// ---------------------------------------------------------------------------
// Demo users
// ---------------------------------------------------------------------------

const DEMO_USERS = [
  { id: "usr_demo_priya", name: "Priya" },
] as const;

type DemoUserId = (typeof DEMO_USERS)[number]["id"];

// ---------------------------------------------------------------------------
// Constants from CONTRACTS
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = ["groceries", "electronics_accessories", "gift_cards"] as const;
const ALL_MERCHANTS = ["freshmart", "gadgethub", "dealsdaily"] as const;
const BUDGET_PERIODS: BudgetPeriod[] = ["week", "month", "once"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortHash(s: string): string {
  return s.slice(0, 8);
}

/** Parse a decimal string; return it formatted to 2 decimal places or null if invalid. */
function parseDecimalString(s: string): string | null {
  const trimmed = s.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const n = parseFloat(trimmed);
  if (!isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

function formatDecimal(s: string): string {
  const n = parseFloat(s);
  if (!isFinite(n)) return s;
  return n.toFixed(2);
}

// ---------------------------------------------------------------------------
// Mandate form state
// ---------------------------------------------------------------------------

interface MandateFormState {
  agent_id: string;
  categories: string[];
  merchants: string[];
  budget_amount: string;
  budget_period: BudgetPeriod;
  currency: string;
  starts_at: string;
  expires_at: string;
}

const EMPTY_FORM: MandateFormState = {
  agent_id: "agt_demo_shopper",
  categories: [],
  merchants: [],
  budget_amount: "",
  budget_period: "month",
  currency: "USD",
  starts_at: "",
  expires_at: "",
};

function mandateToForm(m: Mandate): MandateFormState {
  return {
    agent_id: m.agent_id,
    categories: [...m.categories],
    merchants: [...m.merchants],
    budget_amount: m.budget_amount,
    budget_period: m.budget_period,
    currency: m.currency,
    starts_at: m.starts_at ? m.starts_at.slice(0, 16) : "",
    expires_at: m.expires_at ? m.expires_at.slice(0, 16) : "",
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface FormErrors {
  agent_id?: string;
  categories?: string;
  merchants?: string;
  budget_amount?: string;
  starts_at?: string;
  general?: string;
}

function validateForm(f: MandateFormState): FormErrors {
  const errors: FormErrors = {};
  if (!f.agent_id.trim()) errors.agent_id = "Agent ID is required.";
  if (f.categories.length === 0) errors.categories = "Select at least one category.";
  if (f.merchants.length === 0) errors.merchants = "Select at least one merchant.";
  const parsed = parseDecimalString(f.budget_amount);
  if (!parsed || parseFloat(parsed) <= 0)
    errors.budget_amount = "Budget amount must be a positive decimal (e.g. 200.00).";
  if (!f.starts_at) errors.starts_at = "Start date is required.";
  if (f.starts_at && f.expires_at) {
    const s = new Date(f.starts_at).getTime();
    const e = new Date(f.expires_at).getTime();
    if (isNaN(s) || isNaN(e)) errors.general = "Invalid date format.";
    else if (e <= s) errors.general = "Expiration must be after start date.";
  }
  return errors;
}

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

// ---------------------------------------------------------------------------
// VaultSection
// ---------------------------------------------------------------------------

function VaultSection({ userId, vaulted }: { userId: DemoUserId; vaulted: boolean }) {
  const [loading, setLoading] = useState(false);
  const [pending501, setPending501] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    setPending501(false);
    try {
      const { approve_url } = await getVaultSetup(userId);
      window.location.href = approve_url;
    } catch (err) {
      if (err instanceof ApiError && err.status === 501) {
        setPending501(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to start PayPal setup.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="saas-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-fg">
              PayPal Vault Settlement
            </h2>
            {vaulted ? (
              <span className="saas-badge saas-badge-success text-[11px]">
                Connected
              </span>
            ) : (
              <span className="saas-badge saas-badge-neutral text-[11px]">
                Mock Mode Active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Pre-authorized PayPal payment method for autonomous AI agent checkouts using AUTHORIZE-and-capture.
          </p>
        </div>

        <div>
          {vaulted ? (
            <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Saved in Vault</span>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1.5">
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                onClick={handleConnect}
                disabled={loading}
              >
                {loading ? "Connecting..." : "Connect Live PayPal"}
              </button>
              {pending501 && (
                <span className="text-[11px] text-slate-400">
                  Sandbox credentials pending — currently using mock engine.
                </span>
              )}
              {error && (
                <span className="text-xs text-rose-600 dark:text-rose-400">
                  {error}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// AgentSection
// ---------------------------------------------------------------------------

interface AgentKey {
  keyid: string;
  alg: string;
  public_key: string;
  revoked: boolean;
}

function AgentSection() {
  const [agents, setAgents] = useState<AgentKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const [agentRetryKey, setAgentRetryKey] = useState(0);
  const loadAgents = useCallback(() => setAgentRetryKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAgentKeys()
      .then(({ keys }) => {
        if (!active) return;
        setAgents(keys);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load agents.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [agentRetryKey]);

  async function handleRevoke(agentId: string) {
    if (!confirm(`Revoke agent ${agentId}? This will prevent all future checkout operations.`)) return;
    setRevoking(agentId);
    try {
      await revokeAgent(agentId);
      setAgents((prev) =>
        prev.map((a) => (a.keyid === agentId ? { ...a, revoked: true } : a))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke agent.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section className="saas-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-fg">
            Authorized Agent Credentials
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cryptographic Ed25519 public keys permitted to execute signed checkouts via RFC 9421.
          </p>
        </div>
        <span className="font-mono text-xs text-slate-500">
          {agents.filter((a) => !a.revoked).length} Active Keys
        </span>
      </div>

      {loading && (
        <div className="py-2" aria-label="Loading agents">
          <SkeletonBlock lines={2} />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button
            className="text-xs font-semibold text-rose-700 dark:text-rose-300 underline"
            onClick={loadAgents}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && agents.length === 0 && !error && (
        <p className="text-xs text-slate-500">
          No registered agents found.
        </p>
      )}

      <ul className="space-y-2.5">
        {agents.map((agent) => (
          <li
            key={agent.keyid}
            className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/40"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-fg">
                  {agent.keyid}
                </span>
                {agent.revoked ? (
                  <span className="saas-badge saas-badge-danger text-[10px] uppercase font-mono">
                    Revoked
                  </span>
                ) : (
                  <span className="saas-badge saas-badge-success text-[10px] uppercase font-mono">
                    Verified
                  </span>
                )}
              </div>
              <span className="font-mono text-xs text-slate-500" title={agent.public_key}>
                key: <span className="text-slate-700 dark:text-slate-300">{shortHash(agent.public_key)}...</span> (Ed25519)
              </span>
            </div>

            {!agent.revoked && (
              <button
                className="rounded-md border border-rose-500/30 bg-rose-500/5 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-500/15 dark:text-rose-400 cursor-pointer transition"
                disabled={revoking === agent.keyid}
                onClick={() => handleRevoke(agent.keyid)}
              >
                {revoking === agent.keyid ? "Revoking..." : "Revoke Access"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// MandateForm
// ---------------------------------------------------------------------------

function MandateForm({
  initial,
  editingId,
  agentKeys,
  onSubmit,
  onCancel,
}: {
  initial: MandateFormState;
  editingId: string | null;
  agentKeys: AgentKey[];
  onSubmit: (f: MandateFormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<MandateFormState>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof MandateFormState>(k: K, v: MandateFormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setErrors({
        general: err instanceof Error ? err.message : "Failed to save mandate.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-indigo-500/30 bg-indigo-50/20 p-5 space-y-4 dark:border-indigo-500/20 dark:bg-slate-950/40"
    >
      <h3 className="text-sm font-bold text-slate-900 dark:text-fg">
        {editingId ? "Edit Spending Mandate" : "Create New Spending Mandate"}
      </h3>

      {/* Agent */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
          Agent ID
        </label>
        <input
          type="text"
          value={form.agent_id}
          onChange={(e) => setField("agent_id", e.target.value)}
          placeholder="agt_demo_shopper"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-900 dark:text-fg"
          list="agent-keys-list"
        />
        <datalist id="agent-keys-list">
          {agentKeys.filter((a) => !a.revoked).map((a) => (
            <option key={a.keyid} value={a.keyid} />
          ))}
        </datalist>
        {errors.agent_id && (
          <p className="text-xs mt-1 text-rose-600 dark:text-rose-400">{errors.agent_id}</p>
        )}
      </div>

      {/* Categories */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
          Authorized Categories
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((cat) => {
            const isSelected = form.categories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setField("categories", toggle(form.categories, cat))}
                className={`rounded-md px-2.5 py-1 text-xs font-medium border transition cursor-pointer ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
        {errors.categories && (
          <p className="text-xs mt-1 text-rose-600 dark:text-rose-400">{errors.categories}</p>
        )}
      </div>

      {/* Merchants */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
          Authorized Merchants
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_MERCHANTS.map((m) => {
            const isSelected = form.merchants.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => setField("merchants", toggle(form.merchants, m))}
                className={`rounded-md px-2.5 py-1 text-xs font-medium border transition cursor-pointer ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
        {errors.merchants && (
          <p className="text-xs mt-1 text-rose-600 dark:text-rose-400">{errors.merchants}</p>
        )}
      </div>

      {/* Budget */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Budget Cap (USD)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={form.budget_amount}
            onChange={(e) => setField("budget_amount", e.target.value)}
            placeholder="200.00"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-fg"
          />
          {errors.budget_amount && (
            <p className="text-xs mt-1 text-rose-600 dark:text-rose-400">{errors.budget_amount}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Reset Frequency
          </label>
          <select
            value={form.budget_period}
            onChange={(e) => setField("budget_period", e.target.value as BudgetPeriod)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-fg"
          >
            {BUDGET_PERIODS.map((p) => (
              <option key={p} value={p}>
                Per {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Effective From
          </label>
          <input
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => setField("starts_at", e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-fg"
          />
          {errors.starts_at && (
            <p className="text-xs mt-1 text-rose-600 dark:text-rose-400">{errors.starts_at}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Expires At (Optional)
          </label>
          <input
            type="datetime-local"
            value={form.expires_at}
            onChange={(e) => setField("expires_at", e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-fg"
          />
        </div>
      </div>

      {errors.general && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{errors.general}</p>
      )}

      <div className="flex gap-2.5 pt-2">
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
          disabled={submitting}
        >
          {submitting ? "Saving..." : editingId ? "Save Changes" : "Sign & Create Mandate"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// MandateCard
// ---------------------------------------------------------------------------

interface MandateCardProps {
  mandate: Mandate;
  revoking: string | null;
  onEdit: (m: Mandate) => void;
  onRevoke: (id: string) => void;
}

function MandateCard({ mandate, revoking, onEdit, onRevoke }: MandateCardProps) {
  const isRevoked = !!mandate.revoked_at;

  return (
    <li
      className={`rounded-xl border p-4 transition ${
        isRevoked
          ? "border-slate-200/60 bg-slate-100/50 opacity-60 dark:border-slate-800/60 dark:bg-slate-950/40"
          : "border-slate-200/80 bg-white shadow-xs dark:border-slate-800/80 dark:bg-slate-900/60"
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-slate-900 dark:text-fg">
              {mandate.id}
            </span>
            {isRevoked ? (
              <span className="saas-badge saas-badge-danger text-[10px] uppercase font-mono">
                Revoked
              </span>
            ) : (
              <span className="saas-badge saas-badge-success text-[10px] uppercase font-mono">
                Active Mandate
              </span>
            )}
            <span className="saas-badge saas-badge-brand text-[10px] font-mono" title={`signature: ${mandate.signature}`}>
              sig:{shortHash(mandate.signature)}
            </span>
          </div>
        </div>

        {!isRevoked && (
          <div className="flex gap-2 shrink-0">
            <button
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
              onClick={() => onEdit(mandate)}
            >
              Edit
            </button>
            <button
              className="rounded-md border border-rose-500/30 bg-rose-500/5 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-500/15 dark:text-rose-400 cursor-pointer"
              disabled={revoking === mandate.id}
              onClick={() => onRevoke(mandate.id)}
            >
              {revoking === mandate.id ? "Revoking..." : "Revoke"}
            </button>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <dt className="text-slate-400 font-medium">Agent Scope</dt>
          <dd className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{mandate.agent_id}</dd>
        </div>
        <div>
          <dt className="text-slate-400 font-medium">Budget Limit</dt>
          <dd className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
            ${formatDecimal(mandate.budget_amount)} {mandate.currency} / {mandate.budget_period}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400 font-medium">Merchants</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{mandate.merchants.join(", ") || "All"}</dd>
        </div>
        <div>
          <dt className="text-slate-400 font-medium">Categories</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{mandate.categories.join(", ") || "All"}</dd>
        </div>
      </dl>
    </li>
  );
}

// ---------------------------------------------------------------------------
// MandateSection
// ---------------------------------------------------------------------------

interface MandateSectionProps {
  userId: DemoUserId;
  agentKeys: AgentKey[];
}

function MandateSection({ userId, agentKeys }: MandateSectionProps) {
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingMandate, setEditingMandate] = useState<Mandate | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const [mandateRetryKey, setMandateRetryKey] = useState(0);
  const loadMandates = useCallback(() => setMandateRetryKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getMandates(userId)
      .then((data) => {
        if (!active) return;
        setMandates(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load mandates.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [userId, mandateRetryKey]);

  function openCreate() {
    setEditingMandate(null);
    setShowForm(true);
  }

  function openEdit(mandate: Mandate) {
    setEditingMandate(mandate);
    setShowForm(true);
  }

  function closeForm() {
    setEditingMandate(null);
    setShowForm(false);
  }

  async function handleSubmit(form: MandateFormState) {
    const parsed = parseDecimalString(form.budget_amount);
    if (!parsed) throw new Error("Invalid budget amount.");

    const payload = {
      agent_id: form.agent_id,
      categories: form.categories,
      merchants: form.merchants,
      budget_amount: parsed,
      budget_period: form.budget_period,
      currency: "USD",
      starts_at: new Date(form.starts_at).toISOString(),
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };

    if (editingMandate) {
      const updated = await updateMandate(editingMandate.id, payload);
      setMandates((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
    } else {
      const created = await createMandate(payload);
      setMandates((prev) => [created, ...prev]);
    }
    closeForm();
  }

  async function handleRevoke(mandateId: string) {
    if (!confirm(`Revoke mandate ${mandateId}? This cannot be undone.`)) return;
    setRevoking(mandateId);
    try {
      const updated = await revokeMandate(mandateId);
      setMandates((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke mandate.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section className="saas-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-fg">
            Spending Mandates & Policies
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active constraints defining budget caps, allowable categories, and trusted merchants.
          </p>
        </div>
        {!showForm && (
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700 cursor-pointer"
            onClick={openCreate}
          >
            <span>+ New Mandate</span>
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6">
          <MandateForm
            initial={editingMandate ? mandateToForm(editingMandate) : EMPTY_FORM}
            editingId={editingMandate?.id ?? null}
            agentKeys={agentKeys}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </div>
      )}

      {loading && (
        <div className="py-2" aria-label="Loading mandates">
          <SkeletonBlock lines={3} />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button
            className="text-xs font-semibold underline"
            onClick={loadMandates}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && mandates.length === 0 && !error && !showForm && (
        <p className="text-xs text-slate-500">
          No active mandates configured. Create one to enable agent checkouts.
        </p>
      )}

      <ul className="space-y-3">
        {mandates.map((mandate) => (
          <MandateCard
            key={mandate.id}
            mandate={mandate}
            revoking={revoking}
            onEdit={openEdit}
            onRevoke={handleRevoke}
          />
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// WalletClient (root)
// ---------------------------------------------------------------------------

export default function WalletClient() {
  const searchParams = useSearchParams();
  const vaulted = searchParams.get("vaulted") === "1";

  const [userId, setUserId] = useState<DemoUserId>("usr_demo_priya");
  const [agentKeys, setAgentKeys] = useState<AgentKey[]>([]);

  useEffect(() => {
    getAgentKeys()
      .then(({ keys }) => setAgentKeys(keys))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-fg">
            Wallet & Spend Governance
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Manage authorized shopping agents, PayPal Vault access, and cryptographically signed mandates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="user-select"
            className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
          >
            Persona:
          </label>
          <select
            id="user-select"
            value={userId}
            onChange={(e) => setUserId(e.target.value as DemoUserId)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-900 dark:text-fg shadow-xs"
          >
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <WalletNav />

      {/* Vault */}
      <VaultSection userId={userId} vaulted={vaulted} />

      {/* Agents */}
      <AgentSection />

      {/* Mandates */}
      <MandateSection userId={userId} agentKeys={agentKeys} />
    </div>
  );
}
