"use client";

import React from "react";
import Link from "next/link";
import { OrdersListProps } from "../../componentTypes";
import { OrderSummary } from "../../types";
import { formatCurrency, formatRelativeTime, orderStatusTag } from "../../utils";

export function OrdersTableDesktop({ orders }: OrdersListProps) {
  return (
    <div className="hidden sm:block overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="border-b border-line bg-fg/2">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap">Order</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap">Items</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap">Store</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-fg-dim whitespace-nowrap">Total</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap">Status</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap">Created</th>
          </tr>
        </thead>
        <tbody>
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

            const shortId = order.id.slice(-6).toUpperCase();

            return (
              <tr key={order.id} className="border-b border-line last:border-0 transition hover:bg-fg/2">
                <td className="px-4 py-3 text-sm text-fg-2 align-middle">
                  <Link href={`/orders/${order.id}`} className="font-mono text-xs text-fg hover:text-blue-400">
                    {shortId}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-fg-2 align-middle max-w-72 truncate">
                  {itemsDescription}
                </td>
                <td className="px-4 py-3 text-sm text-fg-2 align-middle">
                  {order.merchant}
                </td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-fg align-middle font-medium">
                  {formatCurrency(order.total, order.currency)}
                </td>
                <td className="px-4 py-3 text-sm text-fg-2 align-middle">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
                    {statusLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-fg-dim whitespace-nowrap align-middle">
                  {formatRelativeTime(order.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
