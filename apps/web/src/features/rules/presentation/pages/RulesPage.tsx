"use client";

import React, { useState } from "react";
import { ShieldPlus } from "lucide-react";
import { RuleModalModeEnum } from "../../enums";
import { useSpendingRules } from "../../hooks/useSpendingRules";
import { SpendingRule } from "../../types";
import { RuleFormModal } from "../components/RuleFormModal";
import { RulesTable } from "../components/RulesTable";
import { Button } from "@/shared/presentation/components/Button";
import { ButtonVariantEnum } from "@/shared/enums";

export function RulesPage() {
  const [modalMode, setModalMode] = useState<RuleModalModeEnum>(
    RuleModalModeEnum.Closed
  );
  const [activeRuleForEdit, setActiveRuleForEdit] = useState<SpendingRule | null>(null);

  const { rules, isLoadingRules, agents, revokeRule } = useSpendingRules();

  const handleOpenCreateModal = () => {
    setActiveRuleForEdit(null);
    setModalMode(RuleModalModeEnum.Create);
  };

  const handleOpenEditModal = (rule: SpendingRule) => {
    setActiveRuleForEdit(rule);
    setModalMode(RuleModalModeEnum.Edit);
  };

  const handleCloseModal = () => {
    setActiveRuleForEdit(null);
    setModalMode(RuleModalModeEnum.Closed);
  };

  const handleEndRule = (rule: SpendingRule) => {
    const confirmationPrompt = "End this rule? The agent will no longer be able to buy under it.";
    const userConfirmed = window.confirm(confirmationPrompt);
    if (!userConfirmed) {
      return;
    }
    revokeRule(rule.id);
  };

  const agentNamesById: Record<string, string> = {};
  agents.forEach((ag) => {
    agentNamesById[ag.id] = ag.name;
  });

  const isModalOpen = modalMode !== RuleModalModeEnum.Closed;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Spending Rules</h1>
          <p className="text-sm text-fg-muted max-w-2xl">
            Spending mandates that restrict your agents. Before PayPal authorizes or captures an order, Sepilo checks
            that it complies with your active rules.
          </p>
        </div>

        {!isModalOpen && (
          <Button
            variant={ButtonVariantEnum.Primary}
            onClick={handleOpenCreateModal}
          >
            <ShieldPlus className="w-4 h-4" strokeWidth={1.8} />
            Set a rule
          </Button>
        )}
      </div>

      {isModalOpen && (
        <RuleFormModal
          mode={modalMode}
          initialRule={activeRuleForEdit}
          availableAgents={agents}
          onClose={handleCloseModal}
        />
      )}

      <div className="saas-card overflow-hidden">
        {isLoadingRules ? (
          <div className="p-8 text-center text-sm text-fg-muted">
            Loading spending rules...
          </div>
        ) : (
          <RulesTable
            rules={rules}
            agentNamesById={agentNamesById}
            onEditRule={handleOpenEditModal}
            onEndRule={handleEndRule}
          />
        )}
      </div>
    </div>
  );
}
