import { useState } from "react";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { HttpMethodEnum } from "@/shared/enums";
import { SCENARIOS } from "../constants";
import { RevealPhaseEnum, ScenarioIdEnum, ScenarioPhaseEnum } from "../enums";
import {
  ScenarioDefinition,
  ScenarioRunResult,
  ScenarioState,
} from "../types";

const createDefaultScenarioState = (): ScenarioState => ({
  phase: ScenarioPhaseEnum.Idle,
  result: null,
  checks: [],
  error: null,
  revealPhase: RevealPhaseEnum.Idle,
  revealTexts: [],
  revealError: null,
});

const INITIAL_STATES: Record<ScenarioIdEnum, ScenarioState> = {
  [ScenarioIdEnum.Normal]: createDefaultScenarioState(),
  [ScenarioIdEnum.HiddenGiftCard]: createDefaultScenarioState(),
  [ScenarioIdEnum.WrongVariant]: createDefaultScenarioState(),
  [ScenarioIdEnum.OverpricedMerchant]: createDefaultScenarioState(),
  [ScenarioIdEnum.BotFarm]: createDefaultScenarioState(),
  [ScenarioIdEnum.RevokedAgent]: createDefaultScenarioState(),
};

export function useAttackLab() {
  const [scenarioStates, setScenarioStates] = useState<Record<ScenarioIdEnum, ScenarioState>>(
    INITIAL_STATES
  );
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [runAllState, setRunAll] = useState<{ running: boolean; done: number; passed: number } | null>(null);

  const setSingleState = (id: ScenarioIdEnum, updater: (prev: ScenarioState) => ScenarioState) => {
    setScenarioStates((prev) => ({
      ...prev,
      [id]: updater(prev[id] || createDefaultScenarioState()),
    }));
  };

  const runScenario = (scenarioId: ScenarioIdEnum): Promise<boolean> => {
    setSingleState(scenarioId, (s) => ({
      ...s,
      phase: ScenarioPhaseEnum.Running,
      error: null,
    }));

    return makeApiCall<ScenarioRunResult>({
      endpoint: `/api/me/lab/${encodeURIComponent(scenarioId)}`,
      method: HttpMethodEnum.Post,
    })
      .then((runResult: ScenarioRunResult) => {
        const checks = Array.isArray(runResult.order?.checks) ? runResult.order.checks : [];
        setSingleState(scenarioId, (s) => ({
          ...s,
          phase: ScenarioPhaseEnum.Done,
          result: runResult,
          checks,
        }));
        return runResult.actual_decision?.toLowerCase() === runResult.expected_decision?.toLowerCase();
      })
      .catch((error: Error) => {
        setSingleState(scenarioId, (s) => ({
          ...s,
          phase: ScenarioPhaseEnum.Error,
          error: error.message,
        }));
        return false;
      });
  };

  const resetLab = (): Promise<boolean> => {
    setIsResetting(true);
    return makeApiCall<{ ok: boolean }>({
      endpoint: "/api/me/lab/reset",
      method: HttpMethodEnum.Post,
    })
      .then(() => {
        setScenarioStates(INITIAL_STATES);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        setIsResetting(false);
      });
  };

  const runAll = async () => {
    setRunAll({ running: true, done: 0, passed: 0 });
    if (!(await resetLab())) {
      setRunAll(null);
      return;
    }
    let passed = 0;
    for (const [index, scenario] of SCENARIOS.entries()) {
      if (await runScenario(scenario.id)) passed += 1;
      setRunAll({ running: index < SCENARIOS.length - 1, done: index + 1, passed });
    }
  };

  const revealPage = (scenario: ScenarioDefinition) => {
    setSingleState(scenario.id, (s) => ({
      ...s,
      revealPhase: RevealPhaseEnum.Loading,
      revealError: null,
    }));

    const firstUrl = scenario.pageUrls[0];
    const hasUrl = Boolean(firstUrl);
    if (!hasUrl || !firstUrl) {
      setSingleState(scenario.id, (s) => ({
        ...s,
        revealPhase: RevealPhaseEnum.Error,
        revealError: "No page URL available for this scenario.",
      }));
      return;
    }

    fetch(firstUrl)
      .then((res) => res.text())
      .then((htmlText) => {
        setSingleState(scenario.id, (s) => ({
          ...s,
          revealPhase: RevealPhaseEnum.Done,
          revealTexts: [htmlText],
        }));
      })
      .catch((err: Error) => {
        setSingleState(scenario.id, (s) => ({
          ...s,
          revealPhase: RevealPhaseEnum.Error,
          revealError: err.message,
        }));
      });
  };

  return {
    scenarioStates,
    runScenario,
    resetLab,
    isResetting,
    revealPage,
    runAll,
    runAllState,
  };
}
