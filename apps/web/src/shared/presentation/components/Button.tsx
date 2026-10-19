"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { ButtonProps } from "@/shared/componentTypes";
import { ButtonVariantEnum } from "@/shared/enums";

export function Button({
  children,
  variant = ButtonVariantEnum.Primary,
  type = "button",
  disabled = false,
  isLoading = false,
  onClick,
  className = "",
  ariaLabel,
}: ButtonProps) {
  const isPrimary = variant === ButtonVariantEnum.Primary;
  const isOutline = variant === ButtonVariantEnum.Outline;
  const isDanger = variant === ButtonVariantEnum.Danger;

  const variantClass = isPrimary
    ? "intentlock-btn-primary"
    : isOutline
    ? "intentlock-btn-outline"
    : isDanger
    ? "btn-danger"
    : "btn-ghost";

  const isButtonDisabled = disabled || isLoading;

  return (
    <button
      type={type}
      disabled={isButtonDisabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`${variantClass} ${className}`}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {children}
    </button>
  );
}
