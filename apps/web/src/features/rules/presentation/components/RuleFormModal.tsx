"use client";

import React, { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { PERIOD_LABELS, SHOPPING_CATEGORIES } from "../../constants";
import { RuleModalModeEnum, RulePeriodEnum, RuleStoresSelectionEnum } from "../../enums";
import { useSpendingRules } from "../../hooks/useSpendingRules";
import { spendingRuleFormSchema } from "../../schemas";
import { RuleModalProps } from "../../types";
import { isValidStoreDomain, parseStoreDomains } from "../../utils";
import { Button } from "@/shared/presentation/components/Button";
import { Input } from "@/shared/presentation/components/Input";
import { Select } from "@/shared/presentation/components/Select";
import { ButtonVariantEnum, InputTypeEnum } from "@/shared/enums";

const localDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function RuleFormModal({
  mode,
  initialRule,
  availableAgents,
  onClose,
}: RuleModalProps) {
  const isEditMode = mode === RuleModalModeEnum.Edit && initialRule !== null;

  const initialAgentId = initialRule ? initialRule.agent_id : "";
  const initialBudget = initialRule ? initialRule.budget_amount : "";
  const initialPeriod = initialRule ? initialRule.budget_period : RulePeriodEnum.Month;
  const initialCategories = initialRule ? [...initialRule.categories] : [];
  const initialStoresSelection =
    !initialRule || initialRule.merchants.includes("*")
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

  const { createRule, updateRule, isCreatingRule, isUpdatingRule, isLoadingAgents } = useSpendingRules();
  const isSubmitting = isCreatingRule || isUpdatingRule;
  const activeAgents = availableAgents.filter((agent) => !agent.revoked_at);
  const selectedAgentId = activeAgents.some((agent) => agent.id === agentId) ? agentId : activeAgents[0]?.id ?? "";
  const today = localDateString(new Date());

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
      agentId: selectedAgentId,
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

    const endOfExpiryDay = expires.length > 0 ? new Date(`${expires}T23:59:59`) : null;
    if (endOfExpiryDay && (Number.isNaN(endOfExpiryDay.getTime()) || endOfExpiryDay.getTime() <= Date.now())) {
      setErrorMessage("Pick an end date from today onwards, or leave it empty.");
      return;
    }
    const parsedExpiryDate = endOfExpiryDay ? endOfExpiryDay.toISOString() : null;
    setErrorMessage(null);

    const payload = {
      agent_id: selectedAgentId,
      categories,
      merchants: stores,
      budget_amount: Number(budget).toFixed(2),
      budget_period: period,
      currency: "USD",
      expires_at: parsedExpiryDate,
    };

    if (isEditMode && initialRule) {
      updateRule({ ruleId: initialRule.id, payload })
        .then(() => onClose())
        .catch((error: Error) => setErrorMessage(error.message));
    } else {
      createRule(payload)
        .then(() => onClose())
        .catch((error: Error) => setErrorMessage(error.message));
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

        {!isLoadingAgents && activeAgents.length === 0 && (
          <p className="text-xs text-amber-400">
            Create or connect an agent first, then give it a spending rule.{" "}
            <Link href="/agents" className="font-medium text-blue-400 hover:text-blue-300">
              Go to Agents
            </Link>
          </p>
        )}

        {errorMessage !== null && (
          <p role="alert" className="text-xs text-rose-400">
            {errorMessage}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-fg-2">Agent</span>
            <Select
              value={selectedAgentId}
              onChange={setAgentId}
              options={activeAgents.map((agent) => ({
                value: agent.id,
                label: agent.name,
                description: agent.managed ? "Hosted by Sepilo" : "Your own agent",
              }))}
              placeholder={isLoadingAgents ? "Loading agents…" : "No agents yet"}
              disabled={activeAgents.length === 0}
              ariaLabel="Agent"
            />
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
            <Select
              value={period}
              onChange={(next: string) => setPeriod(next as RulePeriodEnum)}
              options={[RulePeriodEnum.Month, RulePeriodEnum.Week, RulePeriodEnum.Once].map((option) => ({
                value: option,
                label: PERIOD_LABELS[option],
              }))}
              ariaLabel="Frequency"
            />
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
            <Select
              value={storesSelection}
              onChange={(next: string) => setStoresSelection(next as RuleStoresSelectionEnum)}
              options={[
                { value: RuleStoresSelectionEnum.Any, label: "Any store", description: "Any store Channel3 lists" },
                { value: RuleStoresSelectionEnum.Only, label: "Specific stores only", description: "Only the store websites you list" },
              ]}
              ariaLabel="Store restrictions"
            />
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
              min={today}
              onChange={(e) => setExpires(e.target.value)}
              className="saas-input h-10 w-full"
            />
          </label>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="submit"
            variant={ButtonVariantEnum.Primary}
            isLoading={isSubmitting}
            disabled={activeAgents.length === 0}
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
