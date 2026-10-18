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
  return errors;
}

// ---------------------------------------------------------------------------
// Multi-select toggle helper
// ---------------------------------------------------------------------------

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

// ---------------------------------------------------------------------------
// VaultSection
// ---------------------------------------------------------------------------

interface VaultSectionProps {
  userId: DemoUserId;
  vaulted: boolean;
}

function VaultSection({ userId, vaulted }: VaultSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending501, setPending501] = useState(false);

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
    <section
      className="rounded-lg border p-6"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--color-text)" }}>
        PayPal Vault
      </h2>
      {vaulted ? (
        <span
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium"
          style={{ background: "var(--color-captured-100)", color: "var(--color-status-captured)" }}
        >
          PayPal saved
        </span>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            className="intentlock-btn-primary w-fit"
            onClick={handleConnect}
            disabled={loading}
          >
            {loading ? "Connecting..." : "Connect PayPal"}
          </button>
          {pending501 && (
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              PayPal sandbox setup pending
            </p>
          )}
          {error && (
            <p className="text-sm" style={{ color: "var(--color-status-voided)" }}>
              {error}
            </p>
          )}
        </div>
      )}
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
    if (!confirm(`Revoke agent ${agentId}? This cannot be undone.`)) return;
    setRevoking(agentId);
    try {
      await revokeAgent(agentId);
      // Optimistic refresh
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
    <section
      className="rounded-lg border p-6"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--color-text)" }}>
        Agents
      </h2>
      {loading && (
        <div className="py-2" aria-label="Loading agents">
          <SkeletonBlock lines={2} />
        </div>
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
              onClick={loadAgents}
              aria-label="Retry loading agents"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {!loading && agents.length === 0 && !error && (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No agents registered.
        </p>
      )}
      <ul className="space-y-3">
        {agents.map((agent) => (
          <li
            key={agent.keyid}
            className="flex items-center justify-between rounded-md border px-4 py-3"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {agent.keyid}
              </span>
              <span
                className="font-mono text-xs"
                style={{ color: "var(--color-text-muted)" }}
                title={agent.public_key}
              >
                key: {shortHash(agent.public_key)}...
              </span>
              <div className="flex gap-2 mt-0.5">
                {agent.revoked ? (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      background: "var(--color-danger-100)",
                      color: "var(--color-status-voided)",
                    }}
                  >
                    revoked
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      background: "var(--color-captured-100)",
                      color: "var(--color-status-captured)",
                    }}
                  >
                    verified
                  </span>
                )}
              </div>
            </div>
            {!agent.revoked && (
              <button
                className="intentlock-btn-outline text-xs"
                style={{ color: "var(--color-status-voided)", borderColor: "var(--color-status-voided)" }}
                disabled={revoking === agent.keyid}
                onClick={() => handleRevoke(agent.keyid)}
                aria-label={`Revoke agent ${agent.keyid}`}
              >
                {revoking === agent.keyid ? "Revoking..." : "Revoke"}
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

interface MandateFormProps {
  initial: MandateFormState;
  editingId: string | null;
  agentKeys: AgentKey[];
  onSubmit: (form: MandateFormState) => Promise<void>;
  onCancel: () => void;
}

function MandateForm({ initial, editingId, agentKeys, onSubmit, onCancel }: MandateFormProps) {
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
    setErrors({});
    try {
      await onSubmit(form);
    } catch (err) {
      setErrors({ general: err instanceof Error ? err.message : "Request failed." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border p-6 space-y-4"
      style={{ borderColor: "var(--color-brand)", background: "var(--color-surface)" }}
    >
      <h3 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
        {editingId ? "Edit Mandate" : "Create Mandate"}
      </h3>

      {/* Agent */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
          Agent ID
        </label>
        <input
          type="text"
          value={form.agent_id}
          onChange={(e) => setField("agent_id", e.target.value)}
          placeholder="agt_demo_shopper"
          className="w-full rounded-md border px-3 py-2 text-sm font-mono"
          style={{
            borderColor: errors.agent_id ? "var(--color-status-voided)" : "var(--color-border)",
            background: "var(--color-bg)",
            color: "var(--color-text)",
          }}
          list="agent-keys-list"
        />
        <datalist id="agent-keys-list">
          {agentKeys.filter((a) => !a.revoked).map((a) => (
            <option key={a.keyid} value={a.keyid} />
          ))}
        </datalist>
        {errors.agent_id && (
          <p className="text-xs mt-1" style={{ color: "var(--color-status-voided)" }}>
            {errors.agent_id}
          </p>
        )}
      </div>

      {/* Categories */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
          Categories
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setField("categories", toggle(form.categories, cat))}
              className="rounded-full px-3 py-1 text-xs font-medium border transition-colors"
              style={{
                background: form.categories.includes(cat)
                  ? "var(--color-brand)"
                  : "var(--color-bg)",
                color: form.categories.includes(cat)
                  ? "var(--color-surface)"
                  : "var(--color-text)",
                borderColor: form.categories.includes(cat)
                  ? "var(--color-brand)"
                  : "var(--color-border)",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        {errors.categories && (
          <p className="text-xs mt-1" style={{ color: "var(--color-status-voided)" }}>
            {errors.categories}
          </p>
        )}
      </div>

      {/* Merchants */}
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
          Merchants
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_MERCHANTS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setField("merchants", toggle(form.merchants, m))}
              className="rounded-full px-3 py-1 text-xs font-medium border transition-colors"
              style={{
                background: form.merchants.includes(m)
                  ? "var(--color-brand)"
                  : "var(--color-bg)",
                color: form.merchants.includes(m)
                  ? "var(--color-surface)"
                  : "var(--color-text)",
                borderColor: form.merchants.includes(m)
                  ? "var(--color-brand)"
                  : "var(--color-border)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
        {errors.merchants && (
          <p className="text-xs mt-1" style={{ color: "var(--color-status-voided)" }}>
            {errors.merchants}
          </p>
        )}
      </div>

      {/* Budget */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Budget Amount (USD)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={form.budget_amount}
            onChange={(e) => setField("budget_amount", e.target.value)}
            placeholder="200.00"
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: errors.budget_amount
                ? "var(--color-status-voided)"
                : "var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          />
          {errors.budget_amount && (
            <p className="text-xs mt-1" style={{ color: "var(--color-status-voided)" }}>
              {errors.budget_amount}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Period
          </label>
          <select
            value={form.budget_period}
            onChange={(e) => setField("budget_period", e.target.value as BudgetPeriod)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          >
            {BUDGET_PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Starts At
          </label>
          <input
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => setField("starts_at", e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: errors.starts_at
                ? "var(--color-status-voided)"
                : "var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          />
          {errors.starts_at && (
            <p className="text-xs mt-1" style={{ color: "var(--color-status-voided)" }}>
              {errors.starts_at}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
            Expires At (optional)
          </label>
          <input
            type="datetime-local"
            value={form.expires_at}
            onChange={(e) => setField("expires_at", e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          />
        </div>
      </div>

      {errors.general && (
        <p className="text-sm" style={{ color: "var(--color-status-voided)" }}>
          {errors.general}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="intentlock-btn-primary"
          disabled={submitting}
        >
          {submitting ? "Saving..." : editingId ? "Save Changes" : "Create Mandate"}
        </button>
        <button
          type="button"
          className="intentlock-btn-outline"
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
      // Optimistic refresh
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
    <section
      className="rounded-lg border p-6"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
          Mandates
        </h2>
        {!showForm && (
          <button className="intentlock-btn-primary" onClick={openCreate}>
            + New Mandate
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
              onClick={loadMandates}
              aria-label="Retry loading mandates"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {!loading && mandates.length === 0 && !error && !showForm && (
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No mandates. Click &quot;+ New Mandate&quot; to create one.
        </p>
      )}

      <ul className="space-y-4">
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
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        opacity: isRevoked ? 0.65 : 1,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <span className="font-mono text-sm font-medium" style={{ color: "var(--color-text)" }}>
            {mandate.id}
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {/* Signed chip */}
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono font-medium"
              style={{
                background: "var(--color-primary-100)",
                color: "var(--color-brand)",
              }}
              title={`signature: ${mandate.signature}`}
            >
              signed:{shortHash(mandate.signature)}
            </span>
            {/* Status chip */}
            {isRevoked ? (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  background: "var(--color-danger-100)",
                  color: "var(--color-status-voided)",
                }}
              >
                revoked
              </span>
            ) : (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  background: "var(--color-captured-100)",
                  color: "var(--color-status-captured)",
                }}
              >
                active
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isRevoked && (
          <div className="flex gap-2 shrink-0">
            <button
              className="intentlock-btn-outline text-xs"
              onClick={() => onEdit(mandate)}
              aria-label={`Edit mandate ${mandate.id}`}
            >
              Edit
            </button>
            <button
              className="intentlock-btn-outline text-xs"
              style={{
                color: "var(--color-status-voided)",
                borderColor: "var(--color-status-voided)",
              }}
              disabled={revoking === mandate.id}
              onClick={() => onRevoke(mandate.id)}
              aria-label={`Revoke mandate ${mandate.id}`}
            >
              {revoking === mandate.id ? "Revoking..." : "Revoke"}
            </button>
          </div>
        )}
      </div>

      {/* Details grid */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Agent
          </dt>
          <dd className="font-mono text-xs" style={{ color: "var(--color-text)" }}>
            {mandate.agent_id}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Budget
          </dt>
          <dd style={{ color: "var(--color-text)" }}>
            {formatDecimal(mandate.budget_amount)} {mandate.currency} / {mandate.budget_period}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Categories
          </dt>
          <dd className="text-xs" style={{ color: "var(--color-text)" }}>
            {mandate.categories.join(", ") || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Merchants
          </dt>
          <dd className="text-xs" style={{ color: "var(--color-text)" }}>
            {mandate.merchants.join(", ") || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Starts
          </dt>
          <dd className="text-xs" style={{ color: "var(--color-text)" }}>
            {mandate.starts_at ? new Date(mandate.starts_at).toLocaleDateString() : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
            Expires
          </dt>
          <dd className="text-xs" style={{ color: "var(--color-text)" }}>
            {mandate.expires_at ? new Date(mandate.expires_at).toLocaleDateString() : "none"}
          </dd>
        </div>
      </dl>
    </li>
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

  // Pre-load agent keys so MandateSection can use them for the datalist
  useEffect(() => {
    getAgentKeys()
      .then(({ keys }) => setAgentKeys(keys))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-4xl w-full px-6 py-10 space-y-8">
      {/* Page header + user switcher */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "var(--color-text)" }}>
            Wallet
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Manage your PayPal vault, agents and spending mandates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="user-select"
            className="text-sm font-medium"
            style={{ color: "var(--color-text-muted)" }}
          >
            User:
          </label>
          <select
            id="user-select"
            value={userId}
            onChange={(e) => setUserId(e.target.value as DemoUserId)}
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
            }}
          >
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Vault */}
      <VaultSection userId={userId} vaulted={vaulted} />

      {/* Agents */}
      <AgentSection />

      {/* Mandates */}
      <MandateSection userId={userId} agentKeys={agentKeys} />
    </div>
  );
}
