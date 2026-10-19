"use client";

import React from "react";
import { ChatRoleEnum } from "../../enums";
import { ChatMessageItemProps } from "../../messageTypes";
import { CartItemLine, ChatProductItem } from "../../types";
import { ChatProductCard } from "./ChatProductCard";
import { PurchaseStatusCard } from "./PurchaseStatusCard";
import { SepiloAvatar } from "./SepiloAvatar";
import { useTypewriter } from "../../hooks/useTypewriter";

export function ChatMessageItemView({
  message,
  cart,
  addingProductId,
  onAddToCart,
  animate = false,
}: ChatMessageItemProps) {
  const isUserMessage = message.role === ChatRoleEnum.User;
  const typing = useTypewriter(message.content, animate && !isUserMessage && !message.run);

  if (isUserMessage) {
    return (
      <div className="flex justify-end">
        <div className="max-w-lg rounded-3xl bg-fg/7 px-4 py-2.5 text-[15px] sm:text-sm leading-relaxed text-fg whitespace-pre-wrap wrap-break-word">
          {message.content}
        </div>
      </div>
    );
  }

  const productList = Array.isArray(message.products) ? message.products : [];
  const hasProducts = productList.length > 0;
  const hasRun = Boolean(message.run);
  const cartItems = cart && Array.isArray(cart.items) ? cart.items : [];

  return (
    <div className="flex gap-3">
      <SepiloAvatar />

      <div className="min-w-0 flex-1 space-y-3 sm:pt-1">
        {hasRun ? (
          <PurchaseStatusCard message={message} />
        ) : (
          <p className="text-[15px] sm:text-sm text-fg-2 leading-relaxed whitespace-pre-wrap">
            {typing.shown}
            {!typing.done && <span aria-hidden className="ml-0.5 inline-block w-1.5 h-4 align-[-2px] rounded-sm bg-blue-400/80 animate-pulse" />}
          </p>
        )}

        {hasProducts && typing.done && (
          <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 ${animate ? "animate-[fade-up_.35s_ease-out]" : ""}`}>
            {productList.map((product: ChatProductItem) => {
              const matchedCartLine = cartItems.find(
                (item: CartItemLine) => item.product_id === product.product_id
              );
              const inCartCount = matchedCartLine ? matchedCartLine.qty : 0;
              const isAddingThisProduct = addingProductId === `${message.id}:${product.product_id}`;

              return (
                <ChatProductCard
                  key={product.product_id}
                  product={product}
                  inCartCount={inCartCount}
                  isAdding={isAddingThisProduct}
                  onAddToCart={() => onAddToCart(message, product)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
