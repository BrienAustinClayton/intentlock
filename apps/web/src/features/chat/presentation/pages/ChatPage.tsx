"use client";

import React, { useState } from "react";
import { ArrowUp, Menu, ShoppingCart } from "lucide-react";
import { useChatSessions } from "../../hooks/useChatSessions";
import { ChatCartState, ChatMessageItem, ChatProductItem } from "../../types";
import { ChatCartDrawer } from "../components/ChatCartDrawer";
import { ChatHistoryPanel } from "../components/ChatHistoryPanel";
import { ChatMessageItemView } from "../components/ChatMessageItemView";
import { Button } from "@/shared/presentation/components/Button";
import { Input } from "@/shared/presentation/components/Input";
import { ButtonVariantEnum } from "@/shared/enums";

const DEFAULT_EMPTY_CART: ChatCartState = {
  items: [],
  total: "0.00",
  count: 0,
  currency: "USD",
  stores: 0,
  issues: [],
};

export function ChatPage() {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState<string>("");
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  const {
    chats,
    activeChat,
    createChat,
    sendMessage,
    isSendingMessage,
    addToCart,
    setCartQty,
    checkout,
    isCheckingOut,
    deleteChat,
  } = useChatSessions(activeChatId);

  const cart = activeChat && activeChat.cart ? activeChat.cart : DEFAULT_EMPTY_CART;
  const messages = activeChat && Array.isArray(activeChat.messages) ? activeChat.messages : [];

  const handleSendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const isInputEmpty = !inputText.trim();
    if (isInputEmpty || isSendingMessage) {
      return;
    }

    const trimmedContent = inputText.trim();
    setInputText("");

    if (activeChatId) {
      sendMessage({ chatId: activeChatId, content: trimmedContent });
    } else {
      createChat({}).then((newChat) => {
        setActiveChatId(newChat.id);
        sendMessage({ chatId: newChat.id, content: trimmedContent });
      });
    }
  };

  const handleAddToCart = (message: ChatMessageItem, product: ChatProductItem) => {
    if (!activeChatId) {
      return;
    }
    setAddingProductId(`${message.id}:${product.product_id}`);
    addToCart({
      chatId: activeChatId,
      messageId: message.id,
      productId: product.product_id,
    }).finally(() => {
      setAddingProductId(null);
    });
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-sidebar border-r border-line flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <ChatHistoryPanel
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={(id: string) => {
            setActiveChatId(id);
            setIsSidebarOpen(false);
          }}
          onNewChat={handleNewChat}
          onDeleteChat={(id: string) => {
            deleteChat(id);
            if (activeChatId === id) {
              setActiveChatId(null);
            }
          }}
          onOpenAppMenu={() => {}}
        />
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="h-14 border-b border-line flex items-center justify-between px-4 sm:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-1.5 text-fg-dim hover:text-fg rounded-md"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold text-fg">
              {activeChat ? activeChat.title : "Sepilo Shopping Assistant"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-line bg-fg/4 text-xs font-medium text-fg hover:bg-fg/8 transition"
          >
            <ShoppingCart className="w-4 h-4 text-blue-400" />
            <span>Cart</span>
            <span className="font-semibold text-blue-400">({cart.count})</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-4xl w-full mx-auto">
          {messages.length === 0 && (
            <div className="py-20 text-center space-y-3">
              <h2 className="text-lg font-semibold text-fg">What would you like to buy?</h2>
              <p className="text-sm text-fg-muted max-w-md mx-auto">
                Ask Sepilo to search real merchant catalogs within your spending rules.
              </p>
            </div>
          )}

          {messages.map((message: ChatMessageItem) => (
            <ChatMessageItemView
              key={message.id}
              message={message}
              cart={cart}
              addingProductId={addingProductId}
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>

        <div className="p-4 border-t border-line bg-canvas shrink-0">
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-2">
            <Input
              value={inputText}
              onChange={setInputText}
              maxLength={500}
              placeholder="Ask Sepilo to find products or check rules..."
              className="flex-1 h-11"
            />
            <Button
              type="submit"
              variant={ButtonVariantEnum.Primary}
              disabled={!inputText.trim() || isSendingMessage}
              isLoading={isSendingMessage}
              className="h-11 px-4 shrink-0"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </main>

      <ChatCartDrawer
        isOpen={isCartOpen}
        cart={cart}
        isBusy={isCheckingOut}
        onClose={() => setIsCartOpen(false)}
        onUpdateQty={(productId: string, qty: number) => {
          if (activeChatId) {
            setCartQty({ chatId: activeChatId, productId, qty });
          }
        }}
        onCheckout={() => {
          if (activeChatId) {
            checkout(activeChatId);
          }
        }}
      />
    </div>
  );
}
