import { useState } from "react";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { HttpMethodEnum } from "@/shared/enums";
import { RevealPhaseEnum, ScenarioIdEnum, ScenarioPhaseEnum } from "../enums";
import {
  ScenarioCheckStep,
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

    makeApiCall<ScenarioRunResult>({
      endpoint: `/lab/${encodeURIComponent(scenarioId)}`,
      method: HttpMethodEnum.Post,
    })
      .then((runResult: ScenarioRunResult) => {
        setSingleState(scenarioId, (s) => ({
          ...s,
          phase: ScenarioPhaseEnum.Fetching,
          result: runResult,
        }));

        const hasOrderId = Boolean(runResult.order_id);
        if (hasOrderId) {
          return makeApiCall<{ checks: ScenarioCheckStep[] }>({
            endpoint: `/orders/${encodeURIComponent(runResult.order_id)}`,
            method: HttpMethodEnum.Get,
          }).then((orderDetail) => {
            setSingleState(scenarioId, (s) => ({
              ...s,
              phase: ScenarioPhaseEnum.Done,
              checks: orderDetail.checks || [],
            }));
          });
        }

        setSingleState(scenarioId, (s) => ({
          ...s,
          phase: ScenarioPhaseEnum.Done,
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
      endpoint: "/lab/reset",
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
