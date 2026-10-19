"use client";

import React from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { OrderApprovalActionsProps } from "../../componentTypes";
import { Button } from "@/shared/presentation/components/Button";
import { ButtonVariantEnum } from "@/shared/enums";

export function OrderApprovalActions({
  timeoutAt,
  onApprove,
  onDecline,
  isProcessing,
}: OrderApprovalActionsProps) {
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

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant={ButtonVariantEnum.Primary}
          isLoading={isProcessing}
          onClick={onApprove}
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
