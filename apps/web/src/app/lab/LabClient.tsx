"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, Check as CheckIcon, TriangleAlert, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { me } from "@/lib/me";
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
  order: { checks?: Check[] } | null;
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

function scenarioLabel(s: string): string {
  return SCENARIO_LABELS[s] ?? s;
}

function decisionColor(d: string): string {
  const dl = d?.toLowerCase();
  if (dl === "capture") return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900";
  if (dl === "hold") return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900";
  if (dl === "void" || dl === "reject") return "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900";
  return "text-fg-dim bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700";
}

function DecisionBadge({ decision }: { decision: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-mono font-semibold uppercase ${decisionColor(decision)}`}>
      {decision}
    </span>
  );
}

function resultColor(r: CheckResult): string {
  if (r === "pass") return "text-emerald-600 dark:text-emerald-400";
  if (r === "flag") return "text-amber-600 dark:text-amber-400";
  if (r === "fail" || r === "error") return "text-rose-600 dark:text-rose-400";
  return "text-fg-muted";
}

function stepLabel(s: CheckStep | string): string {
  const LABELS: Partial<Record<CheckStep, string>> = {
    verify_agent: "1. Verify Agent",
    check_mandate: "2. Check Mandate",
    authorize_payment: "3. Authorize",
    scan_injection: "4. Scan Injection",
    intent_diff: "5. Intent Diff",
    graph_risk: "6. Graph Risk",
    decide: "7. Code Policy",
    capture_or_void: "8. Capture/Void",
    build_proof: "9. Build Proof",
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
    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
      <div className="text-[11px] font-medium uppercase tracking-wider text-fg-muted mb-2">
        Pipeline Telemetry · {checks.length} checks
      </div>
      <div className="space-y-1">
        {checks.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-1 text-[12px]">
            <div className="flex items-center gap-2">
              <span className={`font-mono text-[10px] font-semibold uppercase ${resultColor(c.result)}`}>
                {c.result}
              </span>
              <span className="font-medium text-fg-faint dark:text-fg-2">
                {stepLabel(c.step)}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-fg-muted text-[11px]">
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

const SCENARIO_BORDER_COLORS: Record<string, string> = {
  normal: "border-l-gray-300 dark:border-l-gray-600",
  hidden_gift_card: "border-l-rose-400 dark:border-l-rose-500",
  wrong_variant: "border-l-amber-400 dark:border-l-amber-500",
  overpriced_merchant: "border-l-amber-400 dark:border-l-amber-500",
  bot_farm: "border-l-rose-400 dark:border-l-rose-500",
  revoked_agent: "border-l-blue-400 dark:border-l-blue-500",
};

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

  const borderColor = SCENARIO_BORDER_COLORS[info.scenario] ?? "border-l-gray-300";

  const attackPages = info.page_urls
    .map(pageUrlInfo)
    .filter((p) => p.isAttack);

  return (
    <div className={`border border-gray-200 rounded-lg border-l-[3px] ${borderColor} p-5 dark:border-gray-800`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-gray-900 dark:text-fg">
          {scenarioLabel(info.scenario)}
        </h2>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-fg-muted">Expected:</span>
          <DecisionBadge decision={info.expected_decision} />
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-1.5 flex items-center gap-3 font-mono text-[11px] text-fg-muted">
        <span>{info.scenario}</span>
        <span>·</span>
        <span>{info.agent_id}</span>
        <span>·</span>
        <span>{info.merchant}</span>
      </div>

      {/* Narration */}
      <p className="mt-2 text-[12px] text-fg-dim dark:text-fg-muted leading-relaxed">
        {info.narration}
      </p>

      {/* Pages & Attack Inspection */}
      {info.page_urls.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-fg-muted font-medium">Pages:</span>
          {info.page_urls.map((url) => {
            const { href, label, isAttack } = pageUrlInfo(url);
            return (
              <a
                key={url}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition ${
                  isAttack
                    ? "border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400"
                    : "border-gray-200 text-fg-dim hover:bg-gray-50 dark:border-gray-700 dark:text-fg-muted"
                }`}
              >
                {label}
              </a>
            );
          })}

          {/* Reveal hidden instructions button */}
          {attackPages.length > 0 && state.revealPhase === "idle" && (
            <button
              onClick={() => onReveal(info.scenario, attackPages[0].href)}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium ml-1 cursor-pointer text-[11px]"
            >
              <span className="inline-flex items-center gap-1">Inspect injections<ArrowRight className="w-3.5 h-3.5" strokeWidth={2.2} /></span>
            </button>
          )}
        </div>
      )}

      {/* Hidden injection revelation block */}
      {state.revealPhase === "loading" && (
        <div className="mt-2 text-[11px] text-fg-muted">
          Scanning DOM for hidden injection payload...
        </div>
      )}
      {state.revealPhase === "done" && state.revealTexts.length > 0 && (
        <div className="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-[11px] dark:border-rose-900 dark:bg-rose-950/30">
          <div className="flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400 mb-1.5">
            <TriangleAlert className="w-3.5 h-3.5" strokeWidth={2.2} /><span>Hidden instructions found on the page:</span>
          </div>
          <div className="space-y-1 font-mono text-[10px] text-rose-700 dark:text-rose-300">
            {state.revealTexts.map((t, idx) => (
              <div key={idx} className="rounded bg-rose-100/60 px-2 py-1 dark:bg-rose-950/40">
                {t}
              </div>
            ))}
          </div>
        </div>
      )}
      {state.revealPhase === "done" && state.revealTexts.length === 0 && (
        <div className="mt-2 text-[11px] text-fg-muted">
          No hidden CSS injection vectors detected.
        </div>
      )}
      {state.revealPhase === "error" && (
        <div className="mt-2 text-[11px] text-rose-500">
          {state.revealError ?? "Failed to inspect target page."}
        </div>
      )}

      {/* Action and Execution Result */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onRun(info.scenario)}
            disabled={isRunning}
            className={`btn-sm ${isDone || isRunning ? "intentlock-btn-outline" : "intentlock-btn-primary"}`}
          >
            {isRunning ? (
              <>
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Running...</span>
              </>
            ) : isDone ? (
              <span>Re-run</span>
            ) : (
              <span>Execute</span>
            )}
          </button>

          {isDone && state.result && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-fg-muted">Outcome:</span>
              <DecisionBadge decision={state.result.actual_decision} />
              {matched ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium"><CheckIcon className="w-3.5 h-3.5" strokeWidth={2.2} />Match</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium"><X className="w-3.5 h-3.5" strokeWidth={2.2} />Mismatch</span>
              )}
            </div>
          )}
        </div>

        {/* Links to Order & Proof */}
        {isDone && state.result && (
          <div className="flex items-center gap-3 text-[11px]">
            <Link
              href={`/proof/${state.result.order_id}`}
              className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
            >
              Proof of intent
            </Link>
          </div>
        )}
      </div>

      {/* Error state */}
      {state.phase === "error" && state.error && (
        <div className="mt-2 rounded border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400">
          <strong>Error:</strong> {state.error}
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
        const res = await me.labRun<FullRunResult>(scenario);
        const checks: Check[] = res.order?.checks ?? [];

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
      await me.labReset();
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">
            Attack simulator
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-fg-muted max-w-2xl">
            Run six real attacks through the checkout checks: hidden instructions on a product page, the wrong item, an inflated price, a bot-farm store and a revoked agent. They run on a separate sandbox account, so your own orders and budget are untouched.
          </p>
        </div>

        {/* Action Toolbar */}
        <button
          onClick={handleRunAll}
          disabled={isRunAllActive}
          className="intentlock-btn-primary"
        >
          {runAll.phase === "resetting" ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Resetting...</span>
            </>
          ) : runAll.phase === "running" ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Running {runAll.progress}/{runAll.total}...</span>
            </>
          ) : (
            <span>Run All 6 Scenarios</span>
          )}
        </button>
      </div>

      {/* Completion Banner */}
      {runAll.phase === "done" && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <div className="flex items-center gap-2 text-[12px]">
            <span className={`font-medium ${runAll.passed === runAll.total ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              <span className="inline-flex items-center gap-1">{runAll.passed === runAll.total ? <CheckIcon className="w-3.5 h-3.5" strokeWidth={2.2} /> : <TriangleAlert className="w-3.5 h-3.5" strokeWidth={2.2} />}{runAll.passed === runAll.total ? "All scenarios passed" : "Completed with differences"}</span>
            </span>
            <span className="text-fg-muted">
              {runAll.passed}/{runAll.total} matched expected decisions
            </span>
          </div>
          <span className="font-mono text-[11px] text-fg-muted">
            {DEMO_USER}
          </span>
        </div>
      )}

      {/* Scenarios */}
      <div className="space-y-3">
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
