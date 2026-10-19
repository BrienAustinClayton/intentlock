"use client";

import React from "react";
import Link from "next/link";
import { OrdersListProps } from "../../componentTypes";
import { OrderSummary } from "../../types";
import { formatCurrency, formatRelativeTime, orderStatusTag } from "../../utils";

export function OrderCardsMobile({ orders }: OrdersListProps) {
  return (
    <ul className="sm:hidden divide-y divide-line">
      {orders.map((order: OrderSummary) => {
        const { label: statusLabel, style: statusStyle } = orderStatusTag(order.status);

        const cartItems = order.cart || [];
        const hasItems = cartItems.length > 0;
        const firstItem = hasItems ? cartItems[0] : null;
        const itemsDescription = hasItems && firstItem
          ? cartItems.length > 1
            ? `${firstItem.title} and ${cartItems.length - 1} more`
            : firstItem.title
          : "No items";

        return (
          <li key={order.id}>
            <Link
              href={`/orders/${order.id}`}
              className="flex items-start justify-between gap-3 px-4 py-3 active:bg-fg/4"
            >
              <div className="min-w-0">
                <div className="text-sm text-fg line-clamp-2 font-medium">
                  {itemsDescription}
                </div>
                <div className="mt-0.5 text-xs text-fg-dim truncate">
                  {order.merchant} · {formatRelativeTime(order.created_at)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrency(order.total, order.currency)}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
                  {statusLabel}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
