import { ChatCartState, ChatMessageItem, ChatProductItem } from "./types";

export interface ChatMessageItemProps {
  message: ChatMessageItem;
  cart: ChatCartState;
  addingProductId: string | null;
  onAddToCart: (message: ChatMessageItem, product: ChatProductItem) => void;
}
