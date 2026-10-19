"use client";

import React from "react";
import { Check, ExternalLink, ImageOff, ShoppingCart } from "lucide-react";
import { ProductCardProps } from "../../componentTypes";
import { Button } from "@/shared/presentation/components/Button";
import { ButtonVariantEnum } from "@/shared/enums";

export function ChatProductCard({
  product,
  inCartCount,
  isAdding,
  onAddToCart,
}: ProductCardProps) {
  const isInCart = inCartCount > 0;

  return (
    <div className="saas-card flex sm:flex-col overflow-hidden">
      <div className="bg-white flex items-center justify-center overflow-hidden w-24 shrink-0 sm:w-auto sm:h-36 p-2 sm:p-3">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <ImageOff className="w-5 h-5 text-gray-300" strokeWidth={1.5} />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5 sm:gap-2 p-3">
        <div className="text-sm font-medium text-fg line-clamp-2 leading-snug">
          {product.title}
        </div>
        <div className="text-xs text-fg-dim truncate">
          {product.brand ? `${product.brand} · ` : ""}
          {product.merchant}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1 min-w-0">
          <span className="text-[15px] sm:text-base font-semibold tabular-nums truncate text-fg">
            ${product.price}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            {product.url && (
              <a
                href={product.url}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost btn-sm px-2!"
                aria-label="View in store"
              >
                <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.8} />
              </a>
            )}

            <Button
              variant={isInCart ? ButtonVariantEnum.Outline : ButtonVariantEnum.Primary}
              isLoading={isAdding}
              onClick={onAddToCart}
              className="btn-sm whitespace-nowrap px-2.5! sm:px-3!"
            >
              {isInCart ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
                  <span className="tabular-nums">
                    <span className="hidden sm:inline">In cart · </span>
                    {inCartCount}
                  </span>
                </>
              ) : (
                <>
                  <ShoppingCart className="w-3.5 h-3.5" strokeWidth={1.8} />
                  <span className="hidden sm:inline">Add to cart</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
