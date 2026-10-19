"use client";

import React from "react";
import { ChatRoleEnum } from "../../enums";
import { ChatMessageItemProps } from "../../messageTypes";
import { CartItemLine, ChatProductItem } from "../../types";
import { ChatProductCard } from "./ChatProductCard";
import { PurchaseStatusCard } from "./PurchaseStatusCard";

export function ChatMessageItemView({
  message,
  cart,
  addingProductId,
  onAddToCart,
}: ChatMessageItemProps) {
  const isUserMessage = message.role === ChatRoleEnum.User;

  if (isUserMessage) {
    return (
      <div className="flex justify-end">
        <div className="max-w-lg rounded-3xl bg-fg/7 px-4 py-2.5 text-[15px] sm:text-sm leading-relaxed text-fg whitespace-pre-wrap wrap-break-word">
          {message.content}
        </div>
      </div>
    );
  }

  const hasProducts = message.products.length > 0;
  const hasRun = Boolean(message.run);

  return (
    <div className="flex gap-3">
      <span className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[13px] font-semibold text-blue-400">
        S
      </span>

      <div className="min-w-0 flex-1 space-y-3 sm:pt-1">
        {hasRun ? (
          <PurchaseStatusCard message={message} />
        ) : (
          <p className="text-[15px] sm:text-sm text-fg-2 leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        )}

        {hasProducts && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {message.products.map((product: ChatProductItem) => {
              const matchedCartLine = cart.items.find(
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
