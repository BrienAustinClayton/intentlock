import {
  RevealPhaseEnum,
  ScenarioDecisionEnum,
  ScenarioIdEnum,
  ScenarioPhaseEnum,
} from "./enums";

export interface ScenarioDefinition {
  id: ScenarioIdEnum;
  title: string;
  narration: string;
  expectedDecision: ScenarioDecisionEnum;
  pageUrls: string[];
}

export interface ScenarioRunResult {
  order_id: string;
  scenario: string;
  expected_decision: string;
  actual_decision: string;
  status: string;
  reasons: string[];
  order: { checks?: ScenarioCheckStep[] } | null;
}

export interface ScenarioCheckStep {
  step: string;
  result: string;
  latency_ms: number;
}

export interface ScenarioState {
  phase: ScenarioPhaseEnum;
  result: ScenarioRunResult | null;
  checks: ScenarioCheckStep[];
  error: string | null;
  revealPhase: RevealPhaseEnum;
  revealTexts: string[];
  revealError: string | null;
}

export interface ScenarioCardProps {
  scenario: ScenarioDefinition;
  state: ScenarioState;
  onRun: (scenarioId: ScenarioIdEnum) => void;
  onReveal: (scenario: ScenarioDefinition) => void;
}
