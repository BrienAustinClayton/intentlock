"use client";

import React from "react";
import { CommonTextareaProps } from "@/shared/componentTypes";

export function Textarea({
  value,
  onChange,
  placeholder = "",
  maxLength,
  rows = 3,
  required = false,
  disabled = false,
  className = "",
}: CommonTextareaProps) {
  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const rawValue = event.target.value;
    const hasLimit = Boolean(maxLength);
    const exceedsLimit = hasLimit && maxLength && rawValue.length > maxLength;

    const finalValue = exceedsLimit && maxLength
      ? rawValue.slice(0, maxLength)
      : rawValue;

    onChange(finalValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isNavigationKey =
      event.key === "Backspace" ||
      event.key === "Delete" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "Tab";

    if (isNavigationKey) {
      return;
    }

    const hasLimit = Boolean(maxLength);
    const isAtLimit = hasLimit && maxLength && value.length >= maxLength;
    const hasSelection =
      event.currentTarget.selectionStart !== null &&
      event.currentTarget.selectionEnd !== null &&
      event.currentTarget.selectionStart !== event.currentTarget.selectionEnd;

    const shouldBlockByLimit = isAtLimit && !hasSelection;
    if (shouldBlockByLimit) {
      event.preventDefault();
    }
  };

  return (
    <textarea
      rows={rows}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      maxLength={maxLength}
      required={required}
      disabled={disabled}
      className={`saas-input ${className}`}
    />
  );
}
