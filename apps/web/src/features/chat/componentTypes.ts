import { ChatCartState, ChatMessageItem, ChatProductItem, CartReview } from "./types";

export interface ChatSummaryItem {
  id: string;
  title: string;
  agent_id: string;
  updated_at: string;
  preview: string;
}

export interface ProductCardProps {
  product: ChatProductItem;
  inCartCount: number;
  isAdding: boolean;
  onAddToCart: () => void;
}

export interface PurchaseStatusProps {
  message: ChatMessageItem;
}

export interface HistoryPanelProps {
  chats: ChatSummaryItem[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onOpenAppMenu: () => void;
}

export interface CartDrawerProps {
  isOpen: boolean;
  cart: ChatCartState;
  isBusy: boolean;
  onClose: () => void;
  onUpdateQty: (productId: string, qty: number) => void;
  /** confirm: the user saw the cart check's warnings and still wants to buy. */
  onCheckout: (confirm: boolean) => void;
  review: CartReview | null;
}

export interface CartCheckListProps {
  review: CartReview;
}
