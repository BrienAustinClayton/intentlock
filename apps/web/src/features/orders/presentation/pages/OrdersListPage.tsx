"use client";

import React, { useState } from "react";
import { Receipt } from "lucide-react";
import { OrderFilterTabEnum } from "../../enums";
import { useOrdersManagement } from "../../hooks/useOrdersManagement";
import { OrderCardsMobile } from "../components/OrderCardsMobile";
import { OrdersTableDesktop } from "../components/OrdersTableDesktop";

export function OrdersListPage() {
  const [currentTab, setCurrentTab] = useState<OrderFilterTabEnum>(
    OrderFilterTabEnum.All
  );

  const { orders, isLoadingOrders } = useOrdersManagement(currentTab);

  const tabs: Array<{ id: OrderFilterTabEnum; label: string }> = [
    { id: OrderFilterTabEnum.All, label: "All" },
    { id: OrderFilterTabEnum.NeedsApproval, label: "Needs Approval" },
    { id: OrderFilterTabEnum.Paid, label: "Paid" },
    { id: OrderFilterTabEnum.Blocked, label: "Blocked" },
    { id: OrderFilterTabEnum.InProgress, label: "Checking" },
  ];

  const hasNoOrders = orders.length === 0;

  return (
    <div>
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-fg-muted max-w-2xl">
          Every checkout your agents attempted. Sepilo holds the payment, runs its checks, then pays, blocks, or asks you.
        </p>
      </div>

      <div role="tablist" className="flex items-center gap-1 mb-4 border-b border-line overflow-x-auto whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map((tab) => {
          const isSelected = tab.id === currentTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setCurrentTab(tab.id)}
              className={`relative px-3 h-9 text-[13px] font-medium transition ${
                isSelected ? "text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
              {isSelected && (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="saas-card overflow-hidden">
        {isLoadingOrders ? (
          <div className="p-8 text-center text-sm text-fg-muted">
            Loading orders...
          </div>
        ) : hasNoOrders ? (
          <div className="flex flex-col items-center text-center px-6 py-14">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fg/5 text-fg-muted mb-4">
              <Receipt className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <h3 className="text-sm font-semibold text-fg">No orders here</h3>
            <p className="mt-1 text-sm text-fg-muted max-w-sm">
              When your agent checks out, orders will appear here.
            </p>
          </div>
        ) : (
          <>
            <OrderCardsMobile orders={orders} />
            <OrdersTableDesktop orders={orders} />
          </>
        )}
      </div>
    </div>
  );
}
