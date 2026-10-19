"use client";

import React from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { CartCheckListProps } from "../../componentTypes";
import { CartCheckStatusEnum, CartReviewDecisionEnum } from "../../enums";
import { CartCheckItem } from "../../types";

const STATUS_ICON: Record<CartCheckStatusEnum, React.ReactNode> = {
  [CartCheckStatusEnum.Pass]: <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />,
  [CartCheckStatusEnum.Warn]: <TriangleAlert className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.8} />,
  [CartCheckStatusEnum.Block]: <X className="w-3.5 h-3.5 text-rose-400" strokeWidth={2} />,
};

const HEADLINE: Record<CartReviewDecisionEnum, string> = {
  [CartReviewDecisionEnum.Ok]: "Sepilo checked this cart",
  [CartReviewDecisionEnum.Confirm]: "Check these before buying",
  [CartReviewDecisionEnum.Block]: "Sepilo blocked this cart",
};

const TONE: Record<CartReviewDecisionEnum, string> = {
  [CartReviewDecisionEnum.Ok]: "bg-emerald-500/10",
  [CartReviewDecisionEnum.Confirm]: "bg-amber-500/10",
  [CartReviewDecisionEnum.Block]: "bg-rose-500/10",
};

export function CartCheckList({ review }: CartCheckListProps) {
  return (
    <div role="status" className={`rounded-2xl p-3.5 space-y-1.5 ${TONE[review.decision]}`}>
      <p className="text-xs font-semibold text-fg">{HEADLINE[review.decision]}</p>
      {review.checks.map((check: CartCheckItem) => {
        const showDetail = Boolean(check.detail) && check.status !== CartCheckStatusEnum.Pass;
        return (
          <div key={check.key} className="flex gap-2 text-xs">
            <span className="mt-0.5 shrink-0">{STATUS_ICON[check.status]}</span>
            <span>
              <span className="text-fg-2">{check.label}</span>
              {showDetail && <span className="block text-fg-muted">{check.detail}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
