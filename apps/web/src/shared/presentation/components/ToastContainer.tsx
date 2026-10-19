"use client";

import React, { useEffect, useState } from "react";
import { ToastTypeEnum } from "@/shared/enums";
import { removeToast, subscribeToasts } from "@/shared/toast/toastManager";
import { ToastItem } from "@/shared/types";

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts((items: ToastItem[]) => {
      setToasts(items);
    });
  }, []);

  const hasNoToasts = toasts.length === 0;
  if (hasNoToasts) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast: ToastItem) => {
        const isErrorToast = toast.type === ToastTypeEnum.Error;
        const isSuccessToast = toast.type === ToastTypeEnum.Success;
        const isWarningToast = toast.type === ToastTypeEnum.Warning;

        const containerStyle = isErrorToast
          ? "bg-rose-950/90 text-rose-200 border-rose-800"
          : isSuccessToast
          ? "bg-emerald-950/90 text-emerald-200 border-emerald-800"
          : isWarningToast
          ? "bg-amber-950/90 text-amber-200 border-amber-800"
          : "bg-neutral-900/90 text-neutral-200 border-neutral-700";

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur text-sm transition ${containerStyle}`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
