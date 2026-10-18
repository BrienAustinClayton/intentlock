"use client";

import { useState } from "react";
import Link from "next/link";
import { createIntent, ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Demo data from CONTRACTS
// ---------------------------------------------------------------------------

const DEMO_AGENTS = [
  { id: "agt_demo_shopper", label: "Demo Shopper (agt_demo_shopper)" },
] as const;

const DEMO_USER_ID = "usr_demo_priya";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortSig(sig: string): string {
  return sig.slice(0, 12) + "...";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WalletRequestPage() {
  const [requestText, setRequestText] = useState("");
  const [agentId, setAgentId] = useState<string>(DEMO_AGENTS[0].id);

  // Intent creation state
  const [intentId, setIntentId] = useState<string | null>(null);
  const [intentSig, setIntentSig] = useState<string | null>(null);
  const [intentLoading, setIntentLoading] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);

  // Agent run state
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [agentIsError, setAgentIsError] = useState(false);

  // ---------------------------------------------------------------------------
  // POST /intents
  // ---------------------------------------------------------------------------

  async function handleCreateIntent(e: React.FormEvent) {
    e.preventDefault();
    if (!requestText.trim()) {
      setIntentError("Request text is required.");
      return;
    }
    setIntentLoading(true);
    setIntentError(null);
    setIntentId(null);
    setIntentSig(null);
    setAgentMessage(null);

    try {
      const res = await createIntent({
        user_id: DEMO_USER_ID,
        agent_id: agentId,
        request_text: requestText.trim(),
      });
      setIntentId(res.id);
      setIntentSig(res.signature);
    } catch (err) {
      if (err instanceof ApiError) {
        setIntentError(`Failed to create intent: ${err.message}`);
      } else {
        setIntentError("An unexpected error occurred.");
      }
    } finally {
      setIntentLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // POST /api/run-agent
  // ---------------------------------------------------------------------------

  async function handleRunAgent() {
    if (!intentId) return;
    setAgentLoading(true);
    setAgentMessage(null);
    setAgentIsError(false);

    try {
      const res = await fetch("/api/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: intentId }),
      });
      const data = (await res.json()) as { reason?: string };

      if (!res.ok) {
        setAgentIsError(true);
        setAgentMessage(data.reason ?? "Agent returned an error.");
      } else {
        setAgentMessage("Agent started successfully.");
      }
    } catch {
      setAgentIsError(true);
      setAgentMessage("Failed to reach agent service.");
    } finally {
      setAgentLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-2xl w-full px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: "var(--color-text)" }}>
          New Request
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Describe what you want the agent to buy; an intent is signed on your
          behalf.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Request form                                                          */}
      {/* ------------------------------------------------------------------ */}
      <form onSubmit={handleCreateIntent} className="space-y-5">
        {/* Agent picker */}
        <div>
          <label
            htmlFor="agent-select"
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--color-text)" }}
          >
            Agent
          </label>
          <select
            id="agent-select"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm font-mono"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
          >
            {DEMO_AGENTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        {/* Request text */}
        <div>
          <label
            htmlFor="request-text"
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--color-text)" }}
          >
            What would you like to buy?
          </label>
          <textarea
            id="request-text"
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            rows={4}
            placeholder="Groceries for the week, under $80, from FreshMart"
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: intentError
                ? "var(--color-status-voided)"
                : "var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
              resize: "vertical",
            }}
          />
          {intentError && (
            <p
              className="text-xs mt-1"
              style={{ color: "var(--color-status-voided)" }}
            >
              {intentError}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="intentlock-btn-primary"
          disabled={intentLoading}
        >
          {intentLoading ? "Creating Intent..." : "Create Intent"}
        </button>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* Intent result                                                         */}
      {/* ------------------------------------------------------------------ */}
      {intentId && intentSig && (
        <div
          className="mt-8 rounded-lg border p-5 space-y-4"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-surface)",
          }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>
              Intent created
            </span>
            {/* "Signed" chip */}
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{
                background: "var(--color-captured-100)",
                color: "var(--color-status-captured)",
              }}
            >
              signed
            </span>
          </div>

          <dl className="space-y-1.5 text-sm">
            <div className="flex gap-2 flex-wrap">
              <dt
                className="shrink-0 font-medium"
                style={{ color: "var(--color-text-muted)", minWidth: "72px" }}
              >
                Intent ID
              </dt>
              <dd
                className="font-mono break-all"
                style={{ color: "var(--color-text)" }}
              >
                {intentId}
              </dd>
            </div>
            <div className="flex gap-2 flex-wrap">
              <dt
                className="shrink-0 font-medium"
                style={{ color: "var(--color-text-muted)", minWidth: "72px" }}
              >
                Signature
              </dt>
              <dd
                className="font-mono text-xs break-all"
                style={{ color: "var(--color-text-muted)" }}
                title={intentSig}
              >
                {shortSig(intentSig)}
              </dd>
            </div>
          </dl>

          {/* Send to agent */}
          <div className="pt-2">
            <button
              className="intentlock-btn-primary"
              onClick={handleRunAgent}
              disabled={agentLoading}
            >
              {agentLoading ? "Contacting agent..." : "Send to agent"}
            </button>
          </div>

          {/* Agent response message */}
          {agentMessage && (
            <div
              className="rounded-md px-4 py-3 text-sm"
              style={{
                background: agentIsError
                  ? "var(--color-danger-100)"
                  : "var(--color-captured-100)",
                color: agentIsError
                  ? "var(--color-status-voided)"
                  : "var(--color-status-captured)",
                border: `1px solid ${
                  agentIsError
                    ? "var(--color-danger-200)"
                    : "var(--color-captured-200)"
                }`,
              }}
            >
              {agentMessage}
              {agentIsError && (
                <span className="block mt-1">
                  <Link
                    href="/lab"
                    style={{
                      color: "var(--color-brand)",
                      textDecoration: "underline",
                    }}
                  >
                    Try the Attack Lab instead
                  </Link>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
