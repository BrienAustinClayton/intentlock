"use client";

import { useState } from "react";
import Link from "next/link";
import { createIntent, ApiError } from "@/lib/api";
import WalletNav from "@/components/wallet/WalletNav";

// ---------------------------------------------------------------------------
// Demo data from CONTRACTS
// ---------------------------------------------------------------------------

const DEMO_AGENTS = [
  { id: "agt_demo_shopper", label: "Demo Shopper (agt_demo_shopper)" },
] as const;

const DEMO_USER_ID = "usr_demo_priya";

function shortSig(sig: string): string {
  return sig.slice(0, 16) + "...";
}

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

  async function handleCreateIntent(e: React.FormEvent) {
    e.preventDefault();
    if (!requestText.trim()) {
      setIntentError("Request prompt is required.");
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
        setAgentMessage(data.reason ?? "Agent execution failed.");
      } else {
        setAgentMessage("Agent dispatched successfully. Watch orders ledger for verification results.");
      }
    } catch {
      setAgentIsError(true);
      setAgentMessage("Failed to connect to agent service.");
    } finally {
      setAgentLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Create Agent Intent Request
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Sign a cryptographically verifiable purchase prompt. The agent uses this text to buy items, and IntentLock verifies every cart line against it.
        </p>
      </div>

      <WalletNav />

      {/* Request Form */}
      <div className="saas-card p-5">
        <form onSubmit={handleCreateIntent} className="space-y-4">
          <div>
            <label
              htmlFor="agent-select"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Assigned Shopping Agent
            </label>
            <select
              id="agent-select"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-mono text-gray-900"
            >
              {DEMO_AGENTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="request-text"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Natural Language Intent Prompt
            </label>
            <textarea
              id="request-text"
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              rows={4}
              placeholder="e.g. 2 organic whole milks and fresh sourdough bread under $25 from FreshMart"
              className="w-full rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-400 leading-relaxed"
            />
            {intentError && (
              <p className="text-xs mt-1.5 text-rose-600 font-medium">
                {intentError}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 transition disabled:opacity-50 cursor-pointer shadow-xs"
            disabled={intentLoading}
          >
            {intentLoading ? "Signing Intent with Ed25519..." : "Sign & Create Intent"}
          </button>
        </form>
      </div>

      {/* Intent Created Success Box */}
      {intentId && intentSig && (
        <div className="saas-card p-5 border-gray-300 bg-gray-50/50 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="saas-badge saas-badge-success text-xs font-semibold">
                ✓ Cryptographically Signed
              </span>
              <span className="text-xs font-semibold text-gray-900">
                Intent Stored in Gateway
              </span>
            </div>
            <span className="font-mono text-xs text-gray-500">
              User: {DEMO_USER_ID}
            </span>
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-3 font-mono text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Intent ID:</span>
              <span className="font-bold text-gray-900">{intentId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Signature:</span>
              <span className="text-gray-900 font-mono" title={intentSig}>
                {shortSig(intentSig)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 transition disabled:opacity-50 cursor-pointer shadow-xs"
              onClick={handleRunAgent}
              disabled={agentLoading}
            >
              {agentLoading ? "Executing Shopping Agent..." : "Dispatch to Agent Runtime"}
            </button>
            <Link
              href="/wallet/orders"
              className="text-xs text-gray-600 hover:text-gray-900 underline font-medium"
            >
              View Orders Ledger &rarr;
            </Link>
          </div>

          {agentMessage && (
            <div
              className={`rounded-lg p-3 text-xs border ${
                agentIsError
                  ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                  : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              <div className="font-medium">{agentMessage}</div>
              {agentIsError && (
                <div className="mt-1">
                  <Link href="/lab" className="underline font-semibold">
                    Test this scenario in the Attack Lab instead &rarr;
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
