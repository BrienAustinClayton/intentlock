"use client";

import React, { useState } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { OrderApprovalActionsProps } from "../../componentTypes";
import { Button } from "@/shared/presentation/components/Button";
import { Input } from "@/shared/presentation/components/Input";
import { ButtonVariantEnum } from "@/shared/enums";

/** Approving this much needs the total typed back, so a large order can't be approved by reflex. */
const HIGH_VALUE_APPROVAL = 100;

export function OrderApprovalActions({
  timeoutAt,
  total,
  onApprove,
  onDecline,
  isProcessing,
}: OrderApprovalActionsProps) {
  const [typedTotal, setTypedTotal] = useState<string>("");
  const amount = Number(total);
  const needsTypedTotal = amount >= HIGH_VALUE_APPROVAL;
  const typedMatches = Number(typedTotal.replace(/[$,\s]/g, "")) === amount;
  const canApprove = !needsTypedTotal || typedMatches;

  return (
    <div className="saas-card p-4 border-amber-500/30 bg-amber-500/5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
          <TriangleAlert className="w-5 h-5" strokeWidth={1.8} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-fg">Approval required</h2>
          <p className="text-xs text-fg-muted max-w-lg">
            This order was held by policy checks. Funds are held in PayPal but not captured until you approve.
            {timeoutAt !== null && " Approval expires in 30 minutes."}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
        {needsTypedTotal && (
          <Input
            value={typedTotal}
            onChange={setTypedTotal}
            maxLength={20}
            placeholder={`Type ${amount.toFixed(2)} to approve`}
            className="h-10 sm:w-44"
          />
        )}
        <Button
          variant={ButtonVariantEnum.Primary}
          isLoading={isProcessing}
          disabled={!canApprove}
          onClick={() => onApprove(needsTypedTotal ? typedTotal : undefined)}
        >
          <Check className="w-4 h-4" strokeWidth={2} />
          Approve order
        </Button>
        <Button
          variant={ButtonVariantEnum.Danger}
          disabled={isProcessing}
          onClick={onDecline}
        >
          <X className="w-4 h-4" strokeWidth={2} />
          Decline
        </Button>
      </div>
    </div>
  );
}
