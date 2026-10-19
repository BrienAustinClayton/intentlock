import React from "react";
import { AuthFieldProps } from "@/features/auth/componentTypes";

export function AuthField({ label, hint, children }: AuthFieldProps) {
  const hasHint = Boolean(hint);

  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {hasHint ? <span className="block text-xs text-fg-dim">{hint}</span> : null}
    </label>
  );
}
