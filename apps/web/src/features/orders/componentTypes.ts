import { CartItemDetails, OrderSummary, SecurityCheckRecord } from "./types";

export interface OrdersListProps {
  orders: OrderSummary[];
}

export interface OrderHeaderProps {
  order: OrderSummary;
}

export interface SecurityTimelineProps {
  checks: SecurityCheckRecord[];
}

export interface CartItemsTableProps {
  items: CartItemDetails[];
  currency: string;
}

export interface OrderApprovalActionsProps {
  orderId: string;
  timeoutAt: string | null;
  /** Order total; at HIGH_VALUE_APPROVAL or more the user types it back to approve. */
  total: string;
  onApprove: (confirmTotal?: string) => void;
  onDecline: () => void;
  isProcessing: boolean;
}
