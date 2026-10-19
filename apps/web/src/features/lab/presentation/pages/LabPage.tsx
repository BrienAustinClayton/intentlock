"use client";

import React from "react";
import { Play, RefreshCw, ShieldAlert } from "lucide-react";
import { SCENARIOS } from "../../constants";
import { useAttackLab } from "../../hooks/useAttackLab";
import { ScenarioDefinition } from "../../types";
import { ScenarioCard } from "../components/ScenarioCard";
import { Button } from "@/shared/presentation/components/Button";
import { ButtonVariantEnum } from "@/shared/enums";

export function LabPage() {
  const { scenarioStates, runScenario, resetLab, isResetting, revealPage, runAll, runAllState } = useAttackLab();
  const total = SCENARIOS.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-semibold tracking-tight">Attack Lab</h1>
          </div>
          <p className="text-sm text-fg-muted max-w-2xl">
            Simulate real checkout attack vectors against Sepilo&apos;s 9-step verification pipeline. Test hidden CSS
            injections, bot farms, and variant tampering in repeatable environments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={ButtonVariantEnum.Outline}
            isLoading={isResetting && !runAllState?.running}
            disabled={runAllState?.running}
            onClick={() => resetLab()}
          >
            {!isResetting && <RefreshCw className="w-4 h-4" />}
            Reset Lab State
          </Button>
          <Button variant={ButtonVariantEnum.Primary} isLoading={runAllState?.running} onClick={() => runAll()}>
            {!runAllState?.running && <Play className="w-4 h-4" />}
            {runAllState?.running ? `Running ${runAllState.done + 1} of ${total}…` : `Run all ${total} scenarios`}
          </Button>
        </div>
      </div>

      {runAllState && !runAllState.running && (
        <div
          role="status"
          className={`saas-card px-4 py-3 text-sm ${
            runAllState.passed === total ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"
          }`}
        >
          {runAllState.passed === total
            ? `All ${total} scenarios reached the expected decision.`
            : `${runAllState.passed} of ${total} scenarios reached the expected decision. Check the cards below.`}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SCENARIOS.map((scenario: ScenarioDefinition) => {
          const state = scenarioStates[scenario.id];
          return (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              state={state}
              onRun={runScenario}
              onReveal={revealPage}
            />
          );
        })}
      </div>
    </div>
  );
}
