"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { runLabScenario, labReset, getOrder, ApiError } from "@/lib/api";
import { getOrderStatusStyle } from "@/lib/status";
import type {
  Check,
  CheckResult,
  CheckStep,
  LabScenario,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export interface ScenarioInfo {
  scenario: string;
  narration: string;
  expected_decision: string;
  page_urls: string[];
  agent_id: string;
  merchant: string;
}

interface FullRunResult {
  order_id: string;
  scenario: string;
  expected_decision: string;
  actual_decision: string;
  status: string;
  reasons: string[];
}

type ScenarioPhase = "idle" | "running" | "fetching" | "done" | "error";

interface ScenarioState {
  phase: ScenarioPhase;
  result: FullRunResult | null;
  checks: Check[];
  error: string | null;
  revealPhase: "idle" | "loading" | "done" | "error";
  revealTexts: string[];
  revealError: string | null;
}

const IDLE_STATE: ScenarioState = {
  phase: "idle",
  result: null,
  checks: [],
  error: null,
  revealPhase: "idle",
  revealTexts: [],
  revealError: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCENARIO_LABELS: Record<string, string> = {
  normal: "Normal Purchase",
  hidden_gift_card: "Hidden Gift Card",
  wrong_variant: "Wrong Variant",
  overpriced_merchant: "Overpriced Merchant",
  bot_farm: "Bot Farm Network",
  revoked_agent: "Revoked Agent Key",
};

const SCENARIO_CATEGORIES: Record<string, { label: string; badge: string }> = {
  normal: { label: "Baseline Order", badge: "saas-badge-neutral" },
  hidden_gift_card: { label: "Prompt Injection", badge: "saas-badge-danger" },
  wrong_variant: { label: "Intent Drift", badge: "saas-badge-warning" },
  overpriced_merchant: { label: "Price Anomaly", badge: "saas-badge-warning" },
  bot_farm: { label: "Fraud Clustering", badge: "saas-badge-danger" },
  revoked_agent: { label: "Access Control", badge: "saas-badge-brand" },
};

function scenarioLabel(s: string): string {
  return SCENARIO_LABELS[s] ?? s;
}

function DecisionBadge({ decision }: { decision: string }) {
  const d = decision?.toLowerCase();
  let badgeClass = "saas-badge-neutral";
  if (d === "capture") badgeClass = "saas-badge-success";
  else if (d === "hold") badgeClass = "saas-badge-warning";
  else if (d === "void" || d === "reject") badgeClass = "saas-badge-danger";

  return (
    <span className={`saas-badge ${badgeClass} uppercase font-mono font-semibold text-[11px]`}>
      {decision}
    </span>
  );
}

function resultBadgeClass(r: CheckResult): string {
  if (r === "pass") return "saas-badge-success";
  if (r === "flag") return "saas-badge-warning";
  if (r === "fail" || r === "error") return "saas-badge-danger";
  return "saas-badge-neutral";
}

function stepLabel(s: CheckStep | string): string {
  const LABELS: Partial<Record<CheckStep, string>> = {
    verify_agent: "1. Verify Agent (RFC 9421)",
    check_mandate: "2. Check Mandate",
    authorize_payment: "3. PayPal Authorize",
    scan_injection: "4. Scan Injection",
    intent_diff: "5. Intent Diff",
    graph_risk: "6. Graph Risk",
    decide: "7. Code Policy",
    capture_or_void: "8. Capture / Void",
    build_proof: "9. Proof of Intent",
  };
  return LABELS[s as CheckStep] ?? s;
}

function pageUrlInfo(url: string): { href: string; label: string; isAttack: boolean } {
  const basename = url.split("/").pop() ?? url;
  if (url.includes("/attack/")) {
    return { href: `/store/attack/${basename}`, label: basename, isAttack: true };
  }
  return { href: `/store/normal/${basename}`, label: basename, isAttack: false };
}

function extractHiddenTexts(html: string): string[] {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const selectors = [
      '[style*="display:none"]',
      '[style*="display: none"]',
      '[aria-hidden="true"]',
      '[style*="visibility:hidden"]',
      '[style*="visibility: hidden"]',
      '[style*="font-size:0"]',
      '[style*="font-size: 0"]',
      '[style*="color:white"]',
      '[style*="color: white"]',
      '[style*="color:#fff"]',
      '[style*="color:#ffffff"]',
    ];
    const found = new Set<string>();
    for (const sel of selectors) {
      try {
        doc.querySelectorAll(sel).forEach((el) => {
          const t = el.textContent?.trim();
          if (t && t.length > 0) found.add(t);
        });
      } catch {
        // ignore invalid selector
      }
    }
    const commentRe = /<!--([\s\S]*?)-->/g;
    let m: RegExpExecArray | null;
    while ((m = commentRe.exec(html)) !== null) {
      const t = m[1].trim();
      if (t.length > 0) found.add(`<!-- ${t} -->`);
    }
    return Array.from(found);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// ChecksTimeline
// ---------------------------------------------------------------------------

function ChecksTimeline({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800/80 dark:bg-slate-950/40">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
        Pipeline Execution Telemetry ({checks.length} Checks)
      </div>
      <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
        {checks.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className={`saas-badge ${resultBadgeClass(c.result)} font-mono text-[10px] uppercase`}>
                {c.result}
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {stepLabel(c.step)}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-slate-500 text-[11px]">
              {c.score !== null && c.score !== undefined && (
                <span>score: {c.score}</span>
              )}
              <span>{c.duration_ms}ms</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScenarioCard
// ---------------------------------------------------------------------------

function ScenarioCard({
  info,
  state,
  onRun,
  onReveal,
}: {
  info: ScenarioInfo;
  state: ScenarioState;
  onRun: (scenario: string) => void;
  onReveal: (scenario: string, url: string) => void;
}) {
  const isRunning = state.phase === "running" || state.phase === "fetching";
  const isDone = state.phase === "done";
  const matched =
    isDone &&
    state.result?.actual_decision === state.result?.expected_decision;

  const category = SCENARIO_CATEGORIES[info.scenario] ?? {
    label: "Security Test",
    badge: "saas-badge-neutral",
  };

  const attackPages = info.page_urls
    .map(pageUrlInfo)
    .filter((p) => p.isAttack);

  return (
    <div className="saas-card p-6 transition-all duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`saas-badge ${category.badge}`}>
            {category.label}
          </span>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {scenarioLabel(info.scenario)}
          </h2>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Expected:</span>
          <DecisionBadge decision={info.expected_decision} />
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-2 flex items-center gap-3 font-mono text-xs text-slate-500">
        <span>scenario: <strong className="text-slate-700 dark:text-slate-300">{info.scenario}</strong></span>
        <span>•</span>
        <span>agent: <strong className="text-slate-700 dark:text-slate-300">{info.agent_id}</strong></span>
        <span>•</span>
        <span>merchant: <strong className="text-slate-700 dark:text-slate-300">{info.merchant}</strong></span>
      </div>

      {/* Narration */}
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {info.narration}
      </p>

      {/* Pages & Attack Inspection */}
      {info.page_urls.length > 0 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500 font-medium">Test Pages:</span>
          {info.page_urls.map((url) => {
            const { href, label, isAttack } = pageUrlInfo(url);
            return (
              <a
                key={url}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-medium border transition ${
                  isAttack
                    ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20"
                    : "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                <span>{label}</span>
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            );
          })}

          {/* Reveal hidden instructions button */}
          {attackPages.length > 0 && state.revealPhase === "idle" && (
            <button
              onClick={() => onReveal(info.scenario, attackPages[0].href)}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium ml-2 cursor-pointer"
            >
              Inspect Hidden CSS Injections &rarr;
            </button>
          )}
        </div>
      )}

      {/* Hidden injection revelation block */}
      {state.revealPhase === "loading" && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Scanning DOM for hidden injection payload...
        </div>
      )}
      {state.revealPhase === "done" && state.revealTexts.length > 0 && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs dark:bg-rose-950/40">
          <div className="flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-300 mb-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Detected Hidden Adversarial Instructions in HTML:</span>
          </div>
          <div className="space-y-1 font-mono text-[11px] text-rose-800 dark:text-rose-200">
            {state.revealTexts.map((t, idx) => (
              <div key={idx} className="rounded bg-rose-500/10 px-2 py-1 border border-rose-500/20">
                {t}
              </div>
            ))}
          </div>
        </div>
      )}
      {state.revealPhase === "done" && state.revealTexts.length === 0 && (
        <div className="mt-3 text-xs text-slate-500">
          No hidden CSS injection vectors detected in page DOM.
        </div>
      )}
      {state.revealPhase === "error" && (
        <div className="mt-3 text-xs text-rose-600 dark:text-rose-400">
          {state.revealError ?? "Failed to inspect target page."}
        </div>
      )}

      {/* Action and Execution Result */}
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onRun(info.scenario)}
            disabled={isRunning}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold shadow-xs transition cursor-pointer ${
              isRunning
                ? "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400 cursor-not-allowed"
                : isDone
                ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {isRunning ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Evaluating Pipeline...</span>
              </>
            ) : isDone ? (
              <span>Re-evaluate Scenario</span>
            ) : (
              <span>Execute Verification</span>
            )}
          </button>

          {isDone && state.result && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Outcome:</span>
              <DecisionBadge decision={state.result.actual_decision} />
              {matched ? (
                <span className="saas-badge saas-badge-success font-semibold text-[11px]">
                  ✓ Verified As Expected
                </span>
              ) : (
                <span className="saas-badge saas-badge-danger font-semibold text-[11px]">
                  ✗ Mismatch
                </span>
              )}
            </div>
          )}
        </div>

        {/* Links to Order & Proof */}
        {isDone && state.result && (
          <div className="flex items-center gap-3 text-xs">
            <Link
              href={`/wallet/orders/${state.result.order_id}`}
              className="text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 font-medium"
            >
              Order Details &rarr;
            </Link>
            <Link
              href={`/proof/${state.result.order_id}`}
              className="inline-flex items-center gap-1 rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20"
            >
              <span>Proof Certificate</span>
            </Link>
          </div>
        )}
      </div>

      {/* Error state */}
      {state.phase === "error" && state.error && (
        <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
          <strong>Error during execution:</strong> {state.error}
        </div>
      )}

      {/* Telemetry Timeline */}
      {isDone && state.checks.length > 0 && (
        <ChecksTimeline checks={state.checks} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LabClient Main Component
// ---------------------------------------------------------------------------

const DEMO_USER = "usr_demo_priya";

const SCENARIOS_ORDER: LabScenario[] = [
  "normal",
  "hidden_gift_card",
  "wrong_variant",
  "overpriced_merchant",
  "bot_farm",
  "revoked_agent",
];

interface RunAllState {
  phase: "idle" | "resetting" | "running" | "done";
  progress: number;
  total: number;
  passed: number;
  error: string | null;
}

const IDLE_RUN_ALL: RunAllState = {
  phase: "idle",
  progress: 0,
  total: SCENARIOS_ORDER.length,
  passed: 0,
  error: null,
};

export default function LabClient({
  scenarios,
}: {
  scenarios: ScenarioInfo[];
}) {
  const [states, setStates] = useState<Record<string, ScenarioState>>(
    () =>
      Object.fromEntries(scenarios.map((s) => [s.scenario, { ...IDLE_STATE }]))
  );
  const [runAll, setRunAll] = useState<RunAllState>(IDLE_RUN_ALL);

  const updateState = useCallback(
    (scenario: string, patch: Partial<ScenarioState>) => {
      setStates((prev) => ({
        ...prev,
        [scenario]: { ...(prev[scenario] ?? { ...IDLE_STATE }), ...patch },
      }));
    },
    []
  );

  const runScenario = useCallback(
    async (scenario: string): Promise<boolean> => {
      updateState(scenario, { phase: "running", error: null, result: null, checks: [] });
      try {
        const raw = await runLabScenario(scenario as LabScenario, {
          user_id: DEMO_USER,
        });
        const res = raw as unknown as FullRunResult;

        updateState(scenario, { phase: "fetching" });

        let checks: Check[] = [];
        try {
          const order = await getOrder(res.order_id);
          checks = order.checks ?? [];
        } catch {
          // non-fatal, checks stay empty
        }

        updateState(scenario, {
          phase: "done",
          result: res,
          checks,
        });
        return res.actual_decision === res.expected_decision;
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unknown error";
        updateState(scenario, { phase: "error", error: msg });
        return false;
      }
    },
    [updateState]
  );

  const handleRun = useCallback(
    (scenario: string) => {
      runScenario(scenario).catch(() => {});
    },
    [runScenario]
  );

  const handleRunAll = useCallback(async () => {
    setRunAll({ ...IDLE_RUN_ALL, phase: "resetting" });
    setStates(
      Object.fromEntries(scenarios.map((s) => [s.scenario, { ...IDLE_STATE }]))
    );

    try {
      await labReset();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Reset failed";
      setRunAll({ ...IDLE_RUN_ALL, phase: "done", error: msg });
      return;
    }

    setRunAll((prev) => ({ ...prev, phase: "running", progress: 0 }));

    let passed = 0;
    for (let i = 0; i < SCENARIOS_ORDER.length; i++) {
      const s = SCENARIOS_ORDER[i];
      setRunAll((prev) => ({ ...prev, progress: i + 1 }));
      const ok = await runScenario(s);
      if (ok) passed++;
    }

    setRunAll({
      phase: "done",
      progress: SCENARIOS_ORDER.length,
      total: SCENARIOS_ORDER.length,
      passed,
      error: null,
    });
  }, [scenarios, runScenario]);

  const handleReveal = useCallback(
    async (scenario: string, pageHref: string) => {
      updateState(scenario, {
        revealPhase: "loading",
        revealTexts: [],
        revealError: null,
      });
      try {
        const res = await fetch(pageHref);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const texts = extractHiddenTexts(html);
        updateState(scenario, { revealPhase: "done", revealTexts: texts });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch page";
        updateState(scenario, { revealPhase: "error", revealError: msg });
      }
    },
    [updateState]
  );

  const isRunAllActive =
    runAll.phase === "resetting" || runAll.phase === "running";

  return (
    <div className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Top Banner / Toolbar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 sm:p-8 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
              <span>Security Evaluation Harness</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Attack Lab Console
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Trigger repeatable adversarial vectors through IntentLock&apos;s real-time checkout pipeline.
              Verify injection defense, intent drift classification, and graph fraud scores.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={handleRunAll}
              disabled={isRunAllActive}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 cursor-pointer disabled:opacity-50"
            >
              {runAll.phase === "resetting" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Resetting State...</span>
                </>
              ) : runAll.phase === "running" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Running {runAll.progress}/{runAll.total}...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Run All 6 Scenarios</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress or Completion Banner */}
        {runAll.phase === "done" && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`saas-badge ${runAll.passed === runAll.total ? "saas-badge-success" : "saas-badge-warning"} text-sm font-semibold`}>
                {runAll.passed === runAll.total ? "✓ All Scenarios Passed" : "⚠ Completed with Discrepancies"}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {runAll.passed} of {runAll.total} scenarios matched their expected security decisions.
              </span>
            </div>
            <span className="font-mono text-xs text-slate-500">
              User: {DEMO_USER}
            </span>
          </div>
        )}
      </div>

      {/* Scenarios Grid */}
      <div className="space-y-4">
        {SCENARIOS_ORDER.map((s) => {
          const info = scenarios.find((i) => i.scenario === s);
          if (!info) return null;
          const state = states[s] ?? { ...IDLE_STATE };
          return (
            <ScenarioCard
              key={s}
              info={info}
              state={state}
              onRun={handleRun}
              onReveal={handleReveal}
            />
          );
        })}
      </div>
    </div>
  );
}
