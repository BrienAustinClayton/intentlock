"use client";

import React from "react";
import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";
import { PurchaseStatusProps } from "../../componentTypes";
import { AgentRunStatusEnum } from "../../enums";

export function PurchaseStatusCard({ message }: PurchaseStatusProps) {
  const run = message.run;
  if (!run) {
    return null;
  }

  const isRunning = run.status === AgentRunStatusEnum.Running;
  const isOrdered = run.status === AgentRunStatusEnum.Ordered;

  const badgeStyle = isRunning
    ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
    : isOrdered
    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
    : "bg-rose-500/15 text-rose-400 border border-rose-500/30";

  const statusLabel = isRunning
    ? "Buying and checking"
    : isOrdered
    ? "Order placed"
    : "Couldn't buy";

  const hasPayUrl = Boolean(run.pay_url);

  return (
    <div className="saas-card px-4 py-3 space-y-2 max-w-xl">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeStyle}`}>
          {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
          {statusLabel}
        </span>

        {run.order_id && (
          <Link
            href={`/orders/${run.order_id}`}
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            View order
          </Link>
        )}
      </div>

      <p className="text-sm text-fg-2">
        {isRunning ? message.content : run.summary || message.content}
      </p>

      {hasPayUrl && run.pay_url && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <a
            href={run.pay_url}
            className="intentlock-btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Wallet className="w-4 h-4" strokeWidth={1.8} />
            Pay with PayPal
          </a>
          <span className="text-xs text-fg-muted">
            Approve once in PayPal. Sepilo saves it so your agent can pay on its own next time.
          </span>
        </div>
      )}
    </div>
  );
}
