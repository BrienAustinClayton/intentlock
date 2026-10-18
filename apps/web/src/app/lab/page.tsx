export const instant = false;

import fs from "fs";
import path from "path";
import LabClient from "./LabClient";
import type { ScenarioInfo } from "./LabClient";

function loadScenarios(): ScenarioInfo[] {
  const p = path.join(process.cwd(), "../../data/lab/scenarios.json");
  const raw: ScenarioInfo[] = JSON.parse(fs.readFileSync(p, "utf-8"));
  return raw.map((s) => ({
    scenario: s.scenario,
    narration: s.narration,
    expected_decision: s.expected_decision,
    page_urls: s.page_urls ?? [],
    agent_id: s.agent_id,
    merchant: s.merchant,
  }));
}

export default function LabPage() {
  const scenarios = loadScenarios();
  return <LabClient scenarios={scenarios} />;
}
