"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { OrderStatusEnum } from "../../enums";
import { useOrdersManagement } from "../../hooks/useOrdersManagement";
import { OrderDetailPageProps } from "../../pageTypes";
import { formatCurrency, formatRelativeTime } from "../../utils";
import { OrderApprovalActions } from "../components/OrderApprovalActions";
import { OrderCartItemsTable } from "../components/OrderCartItemsTable";
import { SecurityChecksTimeline } from "../components/SecurityChecksTimeline";

export function OrderDetailPage({ orderId }: OrderDetailPageProps) {
  const {
    orderDetail,
    isLoadingOrderDetail,
    approveOrder,
    isApprovingOrder,
    declineOrder,
    isDecliningOrder,
  } = useOrdersManagement(undefined, orderId);

  const isDataMissing = !isLoadingOrderDetail && orderDetail === null;
  if (isDataMissing) {
    return (
      <div className="p-8 text-center text-sm text-fg-muted">
        Order not found.
      </div>
    );
  }

  if (isLoadingOrderDetail || !orderDetail) {
    return (
      <div className="p-8 text-center text-sm text-fg-muted">
        Loading order details...
      </div>
    );
  }

  const { order, checks } = orderDetail;

  const isPaid = order.status === OrderStatusEnum.Captured;
  const isBlocked = order.status === OrderStatusEnum.Voided || order.status === OrderStatusEnum.Rejected;
  const isPending = order.status === OrderStatusEnum.PendingApproval;

  const statusStyle = isPaid
    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
    : isBlocked
    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
    : isPending
    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
    : "bg-blue-500/10 text-blue-400 border border-blue-500/20";

  const statusLabel = isPaid
    ? "Paid"
    : isBlocked
    ? "Blocked"
    : isPending
    ? "Needs Approval"
    : "Checking";

  const isApprovalRequired = order.status === OrderStatusEnum.PendingApproval;
  const isProcessingApproval = isApprovingOrder || isDecliningOrder;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to orders
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              Order {order.id.slice(-6).toUpperCase()}
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
              {statusLabel}
            </span>
          </div>
          <div className="mt-1 text-xs text-fg-dim">
            Placed at {order.merchant} · {formatRelativeTime(order.created_at)}
          </div>
        </div>

        <div className="text-right">
          <div className="text-2xl font-bold tracking-tight text-fg">
            {formatCurrency(order.total, order.currency)}
          </div>
          <div className="text-xs text-fg-muted">Total amount</div>
        </div>
      </div>

      {isApprovalRequired && (
        <OrderApprovalActions
          orderId={order.id}
          timeoutAt={order.approval_timeout_at}
          onApprove={() => approveOrder(order.id)}
          onDecline={() => declineOrder(order.id)}
          isProcessing={isProcessingApproval}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="saas-card overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h2 className="text-sm font-semibold text-fg">Cart Items</h2>
            </div>
            <OrderCartItemsTable
              items={order.cart || []}
              currency={order.currency}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="saas-card overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                Security Pipeline
              </h2>
            </div>
            <SecurityChecksTimeline checks={checks} />
          </div>
        </div>
      </div>
    </div>
  );
}
