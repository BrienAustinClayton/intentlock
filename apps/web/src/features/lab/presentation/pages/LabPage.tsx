"use client";

import React from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { SCENARIOS } from "../../constants";
import { useAttackLab } from "../../hooks/useAttackLab";
import { ScenarioDefinition } from "../../types";
import { ScenarioCard } from "../components/ScenarioCard";
import { Button } from "@/shared/presentation/components/Button";
import { ButtonVariantEnum } from "@/shared/enums";

export function LabPage() {
  const { scenarioStates, runScenario, resetLab, isResetting, revealPage } = useAttackLab();

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

        <Button
          variant={ButtonVariantEnum.Outline}
          isLoading={isResetting}
          onClick={resetLab}
        >
          <RefreshCw className="w-4 h-4" />
          Reset Lab State
        </Button>
      </div>

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
