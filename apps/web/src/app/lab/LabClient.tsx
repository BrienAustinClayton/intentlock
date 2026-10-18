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
  bot_farm: "Bot Farm",
  revoked_agent: "Revoked Agent",
};

function scenarioLabel(s: string): string {
  return SCENARIO_LABELS[s] ?? s;
}

function decisionColor(d: string): string {
  if (d === "capture") return "var(--color-status-captured)";
  if (d === "void" || d === "reject") return "var(--color-status-voided)";
  if (d === "hold") return "var(--color-status-pending-approval)";
  return "var(--color-text-muted)";
}

function resultIcon(r: CheckResult): string {
  if (r === "pass") return "✓";
  if (r === "fail" || r === "error") return "✗";
  if (r === "flag") return "⚑";
  return "–";
}

function resultColor(r: CheckResult): string {
  if (r === "pass") return "var(--color-status-captured)";
  if (r === "fail" || r === "error") return "var(--color-status-voided)";
  if (r === "flag") return "var(--color-status-pending-approval)";
  return "var(--color-text-muted)";
}

function stepLabel(s: CheckStep | string): string {
  const LABELS: Partial<Record<CheckStep, string>> = {
    verify_agent: "Verify Agent",
    check_mandate: "Check Mandate",
    authorize_payment: "Authorize Payment",
    scan_injection: "Scan Injection",
    intent_diff: "Intent Diff",
    graph_risk: "Graph Risk",
    decide: "Decide",
    capture_or_void: "Capture / Void",
    build_proof: "Build Proof",
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
    // Also look for HTML comments that might contain instructions
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
// Sub-components
// ---------------------------------------------------------------------------

function DecisionChip({ decision }: { decision: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase"
      style={{
        background: decisionColor(decision) + "22",
        color: decisionColor(decision),
      }}
    >
      {decision}
    </span>
  );
}

function ChecksTimeline({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return null;
  return (
    <ol className="space-y-1 mt-3">
      {checks.map((c) => (
        <li
          key={c.id}
          className="flex items-start gap-2 text-xs py-1"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <span
            style={{
              minWidth: "1.1rem",
              fontWeight: 700,
              fontSize: "0.95rem",
              color: resultColor(c.result),
            }}
          >
            {resultIcon(c.result)}
          </span>
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <span className="font-medium" style={{ color: "var(--color-text)" }}>
              {stepLabel(c.step)}
            </span>
            <span style={{ color: resultColor(c.result), fontWeight: 600 }}>
              {c.result}
            </span>
            {c.score !== null && c.score !== undefined && (
              <span style={{ color: "var(--color-text-muted)" }}>
                score: {c.score}
              </span>
            )}
            <span style={{ color: "var(--color-text-muted)" }}>
              {c.duration_ms}ms
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: "1rem",
        height: "1rem",
        border: "2px solid var(--color-border)",
        borderTopColor: "var(--color-brand)",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        verticalAlign: "middle",
      }}
    />
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

  const attackPages = info.page_urls
    .map(pageUrlInfo)
    .filter((p) => p.isAttack);

  return (
    <div
      className="rounded-xl border p-5 space-y-3"
      style={{
        borderColor:
          isDone
            ? matched
              ? "var(--color-status-captured)"
              : "var(--color-status-voided)"
            : "var(--color-border)",
        background: "var(--color-surface)",
        transition: "border-color 0.25s",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2
            className="text-base font-bold"
            style={{ color: "var(--color-text)" }}
          >
            {scenarioLabel(info.scenario)}
          </h2>
          <p
            className="text-xs mt-0.5 font-mono"
            style={{ color: "var(--color-text-muted)" }}
          >
            {info.scenario} · agent: {info.agent_id}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            expected:
          </span>
          <DecisionChip decision={info.expected_decision} />
        </div>
      </div>

      {/* Narration */}
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {info.narration}
      </p>

      {/* Page links */}
      {info.page_urls.length > 0 && (
        <div className="flex items-start gap-2 flex-wrap text-xs">
          <span style={{ color: "var(--color-text-muted)" }}>Pages:</span>
          {info.page_urls.map((url) => {
            const { href, label, isAttack } = pageUrlInfo(url);
            return (
              <a
                key={url}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{
                  color: isAttack
                    ? "var(--color-status-voided)"
                    : "var(--color-brand)",
                }}
              >
                {label}
              </a>
            );
          })}
        </div>
      )}

      {/* Reveal hidden text */}
      {attackPages.length > 0 && (
        <div>
          {state.revealPhase === "idle" && (
            <button
              className="text-xs underline"
              style={{ color: "var(--color-text-muted)", cursor: "pointer" }}
              onClick={() => onReveal(info.scenario, attackPages[0].href)}
              aria-label={`Reveal hidden instructions for ${scenarioLabel(info.scenario)}`}
            >
              Reveal hidden instructions
            </button>
          )}
          {state.revealPhase === "loading" && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              <Spinner /> Loading...
            </span>
          )}
          {state.revealPhase === "done" && state.revealTexts.length > 0 && (
            <div
              className="rounded p-3 mt-1"
              style={{
                background: "var(--color-danger-100, #fff1f2)",
                border: "1px solid var(--color-status-voided)",
              }}
            >
              <p
                className="text-xs font-bold mb-1"
                style={{ color: "var(--color-status-voided)" }}
              >
                Hidden instructions found:
              </p>
              {state.revealTexts.map((t, i) => (
                <p
                  key={i}
                  className="text-xs font-mono mt-1"
                  style={{ color: "var(--color-text)", wordBreak: "break-word" }}
                >
                  {t}
                </p>
              ))}
            </div>
          )}
          {state.revealPhase === "done" && state.revealTexts.length === 0 && (
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              No hidden instructions detected.
            </p>
          )}
          {state.revealPhase === "error" && (
            <p className="text-xs" style={{ color: "var(--color-status-voided)" }}>
              {state.revealError ?? "Failed to load page."}
            </p>
          )}
        </div>
      )}

      {/* Run button */}
      <div className="flex items-center gap-3 pt-1">
        <button
          className="intentlock-btn-primary"
          disabled={isRunning}
          onClick={() => onRun(info.scenario)}
          style={{ fontSize: "0.8rem", padding: "0.4rem 1rem" }}
        >
          {isRunning ? (
            <>
              <Spinner /> Running...
            </>
          ) : isDone ? (
            "Re-run"
          ) : (
            "Run"
          )}
        </button>

        {/* Result summary inline */}
        {isDone && state.result && (
          <span className="text-sm font-semibold" style={{ color: matched ? "var(--color-status-captured)" : "var(--color-status-voided)" }}>
            {matched ? "Pass" : "Unexpected"}{" "}
            {matched ? "✓" : "✗"}
          </span>
        )}
      </div>

      {/* Error state */}
      {state.phase === "error" && state.error && (
        <div
          className="rounded px-3 py-2 text-xs"
          style={{
            background: "#fff1f2",
            border: "1px solid var(--color-status-voided)",
            color: "var(--color-status-voided)",
          }}
        >
          {state.error}
        </div>
      )}

      {/* Result block */}
      {isDone && state.result && (
        <div className="space-y-3 pt-1">
          {/* Actual vs Expected */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              actual:
            </span>
            <DecisionChip decision={state.result.actual_decision} />
            {matched ? (
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--color-status-captured)" }}
              >
                as expected
              </span>
            ) : (
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--color-status-voided)" }}
              >
                expected {state.result.expected_decision}
              </span>
            )}
          </div>

          {/* Status chip */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              status:
            </span>
            {(() => {
              const st = getOrderStatusStyle(state.result.status as Parameters<typeof getOrderStatusStyle>[0]);
              return (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    background: st.hex + "22",
                    color: st.chipTextHex ?? st.hex,
                  }}
                >
                  {state.result.status}
                </span>
              );
            })()}
          </div>

          {/* First reason */}
          {state.result.reasons.length > 0 && (
            <p className="text-xs" style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>
              {state.result.reasons[0]}
              {state.result.reasons.length > 1 && (
                <> + {state.result.reasons.length - 1} more</>
              )}
            </p>
          )}

          {/* Checks timeline */}
          <ChecksTimeline checks={state.checks} />

          {/* Links */}
          <div className="flex items-center gap-3 text-xs flex-wrap pt-1">
            <Link
              href={`/wallet/orders/${state.result.order_id}`}
              className="underline"
              style={{ color: "var(--color-brand)" }}
            >
              Order
            </Link>
            <Link
              href={`/proof/${state.result.order_id}`}
              className="underline"
              style={{ color: "var(--color-brand)" }}
            >
              Proof
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LabClient
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
        // Backend also returns reasons and scenario (extra fields beyond LabRunResponse type)
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

    // Reset all scenario states
    setStates(
      Object.fromEntries(scenarios.map((s) => [s.scenario, { ...IDLE_STATE }]))
    );

    // Call /lab/reset
    try {
      await labReset();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Reset failed";
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
    <div
      className="mx-auto max-w-3xl w-full px-6 py-10 space-y-6"
      style={{ color: "var(--color-text)" }}
    >
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--color-text)" }}
          >
            Attack Lab
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Trigger any scenario through the live pipeline and inspect the
            decision.
          </p>
        </div>

        {/* Run All button + summary */}
        <div className="flex flex-col items-end gap-2">
          <button
            className="intentlock-btn-primary"
            disabled={isRunAllActive}
            onClick={() => handleRunAll()}
          >
            {runAll.phase === "resetting" ? (
              <>
                <Spinner /> Resetting...
              </>
            ) : runAll.phase === "running" ? (
              <>
                <Spinner /> Running {runAll.progress}/{runAll.total}...
              </>
            ) : (
              "Run all"
            )}
          </button>

          {runAll.phase === "done" && (
            <p
              className="text-sm font-semibold"
              style={{
                color:
                  runAll.passed === runAll.total
                    ? "var(--color-status-captured)"
                    : "var(--color-status-voided)",
              }}
            >
              {runAll.passed}/{runAll.total} as expected
            </p>
          )}
          {runAll.error && (
            <p className="text-xs" style={{ color: "var(--color-status-voided)" }}>
              {runAll.error}
            </p>
          )}
        </div>
      </div>

      {/* Scenario cards */}
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

      {/* CSS keyframe for spinner */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
