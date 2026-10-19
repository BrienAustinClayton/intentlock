"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Receipt } from "lucide-react";
import { OrderFilterTabEnum } from "../../enums";
import { useOrdersManagement } from "../../hooks/useOrdersManagement";
import { OrderCardsMobile } from "../components/OrderCardsMobile";
import { OrdersTableDesktop } from "../components/OrdersTableDesktop";

const EMPTY_TEXT: Record<OrderFilterTabEnum, string> = {
  [OrderFilterTabEnum.All]: "When your agent checks out, each order shows up here with every check Sepilo ran.",
  [OrderFilterTabEnum.NeedsApproval]: "Nothing is waiting for you. Held orders appear here until you approve or decline.",
  [OrderFilterTabEnum.Paid]: "No orders have been paid yet.",
  [OrderFilterTabEnum.Blocked]: "Nothing has been blocked. Orders that fail a check are stopped before payment.",
  [OrderFilterTabEnum.InProgress]: "No orders are being checked right now.",
};

const TABS = Object.values(OrderFilterTabEnum) as string[];

export function OrdersListPage() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("view") ?? "";
  const currentTab = (TABS.includes(requested) ? requested : OrderFilterTabEnum.All) as OrderFilterTabEnum;
  const setCurrentTab = (tab: OrderFilterTabEnum) =>
    router.replace(tab === OrderFilterTabEnum.All ? "/orders" : `/orders?view=${tab}`, { scroll: false });

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
            <p className="mt-1 text-sm text-fg-muted max-w-sm">{EMPTY_TEXT[currentTab]}</p>
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
