"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { PERIOD_LABELS, SHOPPING_CATEGORIES } from "../../constants";
import { RuleModalModeEnum, RulePeriodEnum, RuleStoresSelectionEnum } from "../../enums";
import { useSpendingRules } from "../../hooks/useSpendingRules";
import { spendingRuleFormSchema } from "../../schemas";
import { RuleModalProps } from "../../types";
import { isValidStoreDomain, parseStoreDomains } from "../../utils";
import { Button } from "@/shared/presentation/components/Button";
import { Input } from "@/shared/presentation/components/Input";
import { ButtonVariantEnum, InputTypeEnum } from "@/shared/enums";

export function RuleFormModal({
  mode,
  initialRule,
  availableAgents,
  onClose,
}: RuleModalProps) {
  const isEditMode = mode === RuleModalModeEnum.Edit && initialRule !== null;

  const initialAgentId = initialRule ? initialRule.agent_id : availableAgents[0]?.id || "";
  const initialBudget = initialRule ? initialRule.budget_amount : "";
  const initialPeriod = initialRule ? initialRule.budget_period : RulePeriodEnum.Month;
  const initialCategories = initialRule ? [...initialRule.categories] : [];
  const initialStoresSelection =
    initialRule && initialRule.merchants.includes("*")
      ? RuleStoresSelectionEnum.Any
      : RuleStoresSelectionEnum.Only;
  const initialStoresText =
    initialRule && !initialRule.merchants.includes("*")
      ? initialRule.merchants.join(", ")
      : "";
  const initialExpires = initialRule && initialRule.expires_at ? initialRule.expires_at.slice(0, 10) : "";

  const [agentId, setAgentId] = useState<string>(initialAgentId);
  const [budget, setBudget] = useState<string>(initialBudget);
  const [period, setPeriod] = useState<RulePeriodEnum>(initialPeriod);
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [storesSelection, setStoresSelection] = useState<RuleStoresSelectionEnum>(initialStoresSelection);
  const [storesText, setStoresText] = useState<string>(initialStoresText);
  const [expires, setExpires] = useState<string>(initialExpires);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { createRule, updateRule, isCreatingRule, isUpdatingRule } = useSpendingRules();
  const isSubmitting = isCreatingRule || isUpdatingRule;

  const toggleCategory = (catKey: string) => {
    const isAlreadySelected = categories.includes(catKey);
    const updatedCategories = isAlreadySelected
      ? categories.filter((c: string) => c !== catKey)
      : [...categories, catKey];
    setCategories(updatedCategories);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const formValidation = spendingRuleFormSchema.safeParse({
      agentId,
      budget,
      period,
      categories,
      storesSelection,
      storesText,
      expires,
    });

    const isValidationFailed = !formValidation.success;
    if (isValidationFailed) {
      const firstIssue = formValidation.error.issues[0];
      setErrorMessage(firstIssue ? firstIssue.message : "Validation failed");
      return;
    }

    const stores =
      storesSelection === RuleStoresSelectionEnum.Any
        ? ["*"]
        : parseStoreDomains(storesText);

    const isStoreListEmpty = stores.length === 0;
    if (isStoreListEmpty) {
      setErrorMessage("Add at least one store domain (e.g. walmart.com) or select Any store.");
      return;
    }

    const invalidStore = stores.find((s: string) => s !== "*" && !isValidStoreDomain(s));
    const hasInvalidStore = Boolean(invalidStore);
    if (hasInvalidStore) {
      setErrorMessage(`"${invalidStore}" is not a valid store website.`);
      return;
    }

    const parsedExpiryDate = expires.length > 0 ? new Date(`${expires}T23:59:59`).toISOString() : null;

    const payload = {
      agent_id: agentId,
      categories,
      merchants: stores,
      budget_amount: Number(budget).toFixed(2),
      budget_period: period,
      currency: "USD",
      expires_at: parsedExpiryDate,
    };

    if (isEditMode && initialRule) {
      updateRule({ ruleId: initialRule.id, payload }).then(() => {
        onClose();
      });
    } else {
      createRule(payload).then(() => {
        onClose();
      });
    }
  };

  return (
    <div className="saas-card overflow-hidden mb-5">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold">
              {isEditMode ? "Edit spending rule" : "Set a spending rule"}
            </h2>
            <p className="text-xs text-fg-muted max-w-xl">
              Control which categories, stores, and budgets your shopping agent can use.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-fg-dim hover:text-fg hover:bg-fg/5"
          >
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>

        {errorMessage !== null && (
          <p role="alert" className="text-xs text-rose-400">
            {errorMessage}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-fg-2">Agent</span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="saas-input h-10"
            >
              {availableAgents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-fg-2">Budget (USD)</span>
            <Input
              required
              inputType={InputTypeEnum.Numeric}
              maxLength={10}
              placeholder="e.g. 150"
              value={budget}
              onChange={setBudget}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-fg-2">Frequency</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as RulePeriodEnum)}
              className="saas-input h-10"
            >
              <option value={RulePeriodEnum.Month}>{PERIOD_LABELS[RulePeriodEnum.Month]}</option>
              <option value={RulePeriodEnum.Week}>{PERIOD_LABELS[RulePeriodEnum.Week]}</option>
              <option value={RulePeriodEnum.Once}>{PERIOD_LABELS[RulePeriodEnum.Once]}</option>
            </select>
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="block text-[13px] font-medium text-fg-2">Allowed Categories</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(SHOPPING_CATEGORIES).map(([catKey, catLabel]) => {
              const isSelected = categories.includes(catKey);
              const chipStyle = isSelected
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                : "bg-fg/4 text-fg-dim border border-line hover:text-fg";

              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => toggleCategory(catKey)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${chipStyle}`}
                >
                  {catLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-fg-2">Store Restrictions</span>
            <select
              value={storesSelection}
              onChange={(e) => setStoresSelection(e.target.value as RuleStoresSelectionEnum)}
              className="saas-input h-10"
            >
              <option value={RuleStoresSelectionEnum.Any}>Any Store</option>
              <option value={RuleStoresSelectionEnum.Only}>Specific Stores Only</option>
            </select>
          </label>

          {storesSelection === RuleStoresSelectionEnum.Only && (
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-fg-2">Stores (Domains)</span>
              <Input
                placeholder="e.g. amazon.com, target.com"
                maxLength={200}
                value={storesText}
                onChange={setStoresText}
              />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-fg-2">Expires on (Optional)</span>
            <input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="saas-input h-10"
            />
          </label>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="submit"
            variant={ButtonVariantEnum.Primary}
            isLoading={isSubmitting}
          >
            {isEditMode ? "Save Changes" : "Create Rule"}
          </Button>
          <Button
            type="button"
            variant={ButtonVariantEnum.Outline}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
