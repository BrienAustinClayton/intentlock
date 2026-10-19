"use client";

import React from "react";
import { Pencil, ShieldCheck } from "lucide-react";
import { PERIOD_LABELS, SHOPPING_CATEGORIES } from "../../constants";
import { RuleStatusEnum } from "../../enums";
import { RulesTableProps, SpendingRule } from "../../types";
import { determineRuleStatus } from "../../utils";

export function RulesTable({
  rules,
  agentNamesById,
  onEditRule,
  onEndRule,
}: RulesTableProps) {
  const hasNoRules = rules.length === 0;

  if (hasNoRules) {
    return (
      <div className="flex flex-col items-center text-center px-6 py-14">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fg/5 text-fg-muted mb-4">
          <ShieldCheck className="w-5 h-5" strokeWidth={1.8} />
        </span>
        <h3 className="text-sm font-semibold text-fg">No spending rules yet</h3>
        <p className="mt-1 text-sm text-fg-muted max-w-sm">
          Set rules to limit what your shopping agents can buy and how much they can spend.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="border-b border-line bg-fg/2">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap">Agent</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap">Budget</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap">Categories</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap">Stores</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap">Status</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-fg-dim whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule: SpendingRule) => {
            const ruleStatus = determineRuleStatus(rule);
            const isActive = ruleStatus === RuleStatusEnum.Active;
            const isEnded = ruleStatus === RuleStatusEnum.Ended;

            const statusStyle = isActive
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : isEnded
              ? "bg-neutral-500/10 text-neutral-400 border border-neutral-500/20"
              : "bg-amber-500/10 text-amber-400 border border-amber-500/20";

            const statusLabel = isActive ? "Active" : isEnded ? "Ended" : "Expired";

            const agentDisplayName = agentNamesById[rule.agent_id] || "Shopping Agent";

            const formattedCategories =
              rule.categories.length > 2
                ? `${rule.categories.slice(0, 2).map((c) => SHOPPING_CATEGORIES[c] || c).join(", ")} +${rule.categories.length - 2}`
                : rule.categories.map((c) => SHOPPING_CATEGORIES[c] || c).join(", ");

            const formattedStores = rule.merchants.includes("*")
              ? "Any store"
              : rule.merchants.join(", ");

            return (
              <tr key={rule.id} className="border-b border-line last:border-0 transition hover:bg-fg/2">
                <td className="px-4 py-3 text-sm text-fg-2 align-middle font-medium">
                  {agentDisplayName}
                </td>
                <td className="px-4 py-3 text-sm text-fg-2 align-middle">
                  <span className="font-semibold tabular-nums text-fg">
                    ${rule.budget_amount}
                  </span>{" "}
                  <span className="text-xs text-fg-muted">
                    {PERIOD_LABELS[rule.budget_period]}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-fg-2 align-middle max-w-52 truncate">
                  {formattedCategories}
                </td>
                <td className="px-4 py-3 text-sm text-fg-2 align-middle max-w-40 truncate">
                  {formattedStores}
                </td>
                <td className="px-4 py-3 text-sm text-fg-2 align-middle">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
                    {statusLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-fg-2 align-middle text-right">
                  <div className="flex items-center justify-end gap-2">
                    {isActive && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEditRule(rule)}
                          className="p-1.5 text-fg-dim hover:text-fg rounded-md transition"
                          title="Edit rule"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEndRule(rule)}
                          className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                        >
                          End
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
