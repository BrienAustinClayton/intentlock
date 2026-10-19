import React from "react";
import { HttpMethodEnum, ToastTypeEnum } from "./enums";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastTypeEnum;
}

export interface ToastListener {
  (toasts: ToastItem[]): void;
}

export interface ApiCallOptions<PayloadType> {
  endpoint: string;
  method?: HttpMethodEnum;
  payload?: PayloadType;
  customHeaders?: Record<string, string>;
  silent?: boolean;
}

export interface ApiErrorDetails {
  statusCode: number;
  errorCode: string;
  errorMessage: string;
}

export interface ProviderProps {
  children: React.ReactNode;
}
