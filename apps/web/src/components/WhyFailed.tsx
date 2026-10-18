"use client";

import { Loader2, RotateCw, X } from "lucide-react";
import { OrderStatusTag, Tag } from "@/components/ui";
import type { AgentRunView } from "@/lib/me";

export function RunOutcome({ run }: { run: AgentRunView }) {
  if (run.status === "running") {
    return (
      <Tag tone="brand">
        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
        Agent shopping
      </Tag>
    );
  }
  if (run.status === "ordered" && run.order_status) return <OrderStatusTag status={run.order_status} />;
  if (run.status === "ordered") return <Tag tone="success">Ordered</Tag>;
  return <Tag tone="danger">Failed</Tag>;
}

export default function WhyFailed({
  run,
  requestText,
  agentName,
  onClose,
  onRetry,
}: {
  run: AgentRunView;
  requestText: string;
  agentName: string | null;
  onClose: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="why-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="popover relative w-full max-w-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="why-title" className="text-sm font-semibold">Why this request failed</h2>
            <p className="text-xs text-fg-muted">{agentName ?? "Your agent"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md text-fg-dim hover:text-fg hover:bg-fg/5">
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-fg-dim">You asked for</div>
          <p className="text-sm text-fg-2">{requestText}</p>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-fg-dim">What happened</div>
          <p className="text-sm text-fg whitespace-pre-wrap rounded-lg bg-fg/[0.04] px-3 py-2.5">
            {run.summary || "The agent couldn't complete this request."}
          </p>
        </div>
        <p className="text-xs text-fg-dim">
          Agents can only buy from the IntentLock store catalog: groceries, electronics accessories and gift cards. Rephrasing the
          request or widening your spending rules can help.
        </p>
        <div className="flex items-center gap-2">
          {onRetry && (
            <button type="button" onClick={onRetry} className="intentlock-btn-primary btn-sm">
              <RotateCw className="w-3.5 h-3.5" strokeWidth={1.8} />
              Try again
            </button>
          )}
          <button type="button" onClick={onClose} className="intentlock-btn-outline btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
