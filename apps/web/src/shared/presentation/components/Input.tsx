"use client";

import React from "react";
import { CommonInputProps } from "@/shared/componentTypes";
import { InputTypeEnum } from "@/shared/enums";

export function Input({
  value,
  onChange,
  inputType = InputTypeEnum.Text,
  placeholder = "",
  maxLength,
  required = false,
  disabled = false,
  className = "",
  name,
}: CommonInputProps) {
  const isNumeric = inputType === InputTypeEnum.Numeric;
  const isPassword = inputType === InputTypeEnum.Password;
  const isEmail = inputType === InputTypeEnum.Email;

  const htmlType = isPassword ? "password" : isEmail ? "email" : "text";

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;

    const filteredValue = isNumeric
      ? rawValue.replace(/[^0-9.]/g, "").replace(/(\..*?)\..*/g, "$1")
      : rawValue;

    const hasLimit = Boolean(maxLength);
    const exceedsLimit = hasLimit && maxLength && filteredValue.length > maxLength;

    const finalValue = exceedsLimit && maxLength
      ? filteredValue.slice(0, maxLength)
      : filteredValue;

    onChange(finalValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
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
      return;
    }

    if (isNumeric) {
      const isDigit = /^[0-9]$/.test(event.key);
      const isDecimalPoint = event.key === ".";
      const alreadyHasDecimal = value.includes(".");
      const canAcceptDecimal = isDecimalPoint && !alreadyHasDecimal;

      const isAllowedKey = isDigit || canAcceptDecimal;
      if (!isAllowedKey) {
        event.preventDefault();
      }
    }
  };

  return (
    <input
      name={name}
      type={htmlType}
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
