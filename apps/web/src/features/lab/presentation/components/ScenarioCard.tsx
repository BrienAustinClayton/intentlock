"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, Code, Play, X } from "lucide-react";
import { ScenarioPhaseEnum } from "../../enums";
import { ScenarioCardProps, ScenarioCheckStep } from "../../types";
import { Button } from "@/shared/presentation/components/Button";
import { ButtonVariantEnum } from "@/shared/enums";

export function ScenarioCard({
  scenario,
  state,
  onRun,
  onReveal,
}: ScenarioCardProps) {
  const [showCode, setShowCode] = useState<boolean>(false);

  const isRunning =
    state.phase === ScenarioPhaseEnum.Running ||
    state.phase === ScenarioPhaseEnum.Fetching;

  const hasResult = state.result !== null;
  const isMatch =
    hasResult &&
    state.result &&
    state.result.actual_decision.toLowerCase() ===
      scenario.expectedDecision.toLowerCase();

  const decisionBadgeStyle =
    scenario.expectedDecision === "capture"
      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      : scenario.expectedDecision === "hold"
      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
      : "bg-rose-500/10 text-rose-400 border border-rose-500/20";

  return (
    <div className="saas-card overflow-hidden flex flex-col justify-between">
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-fg">{scenario.title}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 mt-1.5 rounded-full text-xs font-medium uppercase ${decisionBadgeStyle}`}>
              Expected: {scenario.expectedDecision}
            </span>
          </div>

          <Button
            variant={ButtonVariantEnum.Primary}
            isLoading={isRunning}
            onClick={() => onRun(scenario.id)}
            className="btn-sm"
          >
            <Play className="w-3.5 h-3.5" />
            Run test
          </Button>
        </div>

        <p className="text-xs text-fg-muted leading-relaxed">
          {scenario.narration}
        </p>

        {hasResult && state.result && (
          <div className="pt-3 border-t border-line space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-dim">Actual Decision:</span>
              <span
                className={`font-semibold uppercase px-2 py-0.5 rounded-md ${
                  isMatch
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {state.result.actual_decision}
              </span>
            </div>

            {state.result.order_id && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-fg-dim">Order:</span>
                <Link
                  href={`/orders/${state.result.order_id}`}
                  className="text-blue-400 hover:text-blue-300 font-mono"
                >
                  View Order Detail →
                </Link>
              </div>
            )}

            {state.checks.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="text-[11px] font-semibold text-fg-dim uppercase tracking-wider">
                  Security Pipeline Gates
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {state.checks.map((chk: ScenarioCheckStep) => {
                    const isPassed = chk.result === "pass";
                    return (
                      <div
                        key={chk.step}
                        className="flex items-center gap-1.5 p-1.5 rounded-lg bg-fg/4 text-[11px]"
                      >
                        {isPassed ? (
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : (
                          <X className="w-3 h-3 text-rose-400 shrink-0" />
                        )}
                        <span className="truncate text-fg-2">{chk.step}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {state.error !== null && (
          <p role="alert" className="text-xs text-rose-400 pt-2 border-t border-line">
            {state.error}
          </p>
        )}
      </div>

      {scenario.pageUrls.length > 0 && (
        <div className="px-5 py-3 border-t border-line bg-fg/2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setShowCode(!showCode);
              if (!showCode && state.revealTexts.length === 0) {
                onReveal(scenario);
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs text-fg-dim hover:text-fg transition"
          >
            <Code className="w-3.5 h-3.5" />
            {showCode ? "Hide Page Source" : "Inspect Page Source"}
          </button>
        </div>
      )}

      {showCode && state.revealTexts.length > 0 && (
        <div className="p-4 bg-canvas border-t border-line max-h-48 overflow-y-auto">
          <pre className="text-[11px] font-mono text-fg-dim whitespace-pre-wrap">
            {state.revealTexts[0]}
          </pre>
        </div>
      )}
    </div>
  );
}
