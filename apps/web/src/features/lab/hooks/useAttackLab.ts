import { useState } from "react";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { HttpMethodEnum } from "@/shared/enums";
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

  const setSingleState = (id: ScenarioIdEnum, updater: (prev: ScenarioState) => ScenarioState) => {
    setScenarioStates((prev) => ({
      ...prev,
      [id]: updater(prev[id] || createDefaultScenarioState()),
    }));
  };

  const runScenario = (scenarioId: ScenarioIdEnum) => {
    setSingleState(scenarioId, (s) => ({
      ...s,
      phase: ScenarioPhaseEnum.Running,
      error: null,
    }));

    // Signed-in lab route (the web proxy adds the session); the run returns the order with its checks.
    makeApiCall<ScenarioRunResult>({
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
      })
      .catch((error: Error) => {
        setSingleState(scenarioId, (s) => ({
          ...s,
          phase: ScenarioPhaseEnum.Error,
          error: error.message,
        }));
      });
  };

  const resetLab = () => {
    setIsResetting(true);
    makeApiCall<{ ok: boolean }>({
      endpoint: "/api/me/lab/reset",
      method: HttpMethodEnum.Post,
    })
      .then(() => {
        setScenarioStates(INITIAL_STATES);
      })
      .finally(() => {
        setIsResetting(false);
      });
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
  };
}
