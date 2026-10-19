import React from "react";
import { ButtonVariantEnum, InputTypeEnum } from "./enums";

export interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariantEnum;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  isLoading?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  ariaLabel?: string;
}

export interface CommonInputProps {
  value: string;
  onChange: (value: string) => void;
  inputType?: InputTypeEnum;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
}

export interface CommonTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export interface CardPanelProps {
  children: React.ReactNode;
  className?: string;
}
