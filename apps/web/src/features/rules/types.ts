import { RuleModalModeEnum, RulePeriodEnum, RuleStoresSelectionEnum } from "./enums";

export interface SpendingRule {
  id: string;
  agent_id: string;
  budget_amount: string;
  budget_period: RulePeriodEnum;
  currency: string;
  categories: string[];
  merchants: string[];
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface RuleFormState {
  agentId: string;
  budget: string;
  period: RulePeriodEnum;
  categories: string[];
  storesSelection: RuleStoresSelectionEnum;
  storesText: string;
  expires: string;
}

export interface CreateOrUpdateRulePayload {
  agent_id: string;
  categories: string[];
  merchants: string[];
  budget_amount: string;
  budget_period: RulePeriodEnum;
  currency: string;
  expires_at: string | null;
}

export interface RuleModalProps {
  mode: RuleModalModeEnum;
  initialRule: SpendingRule | null;
  availableAgents: Array<{ id: string; name: string }>;
  onClose: () => void;
}

export interface RulesTableProps {
  rules: SpendingRule[];
  agentNamesById: Record<string, string>;
  onEditRule: (rule: SpendingRule) => void;
  onEndRule: (rule: SpendingRule) => void;
}
