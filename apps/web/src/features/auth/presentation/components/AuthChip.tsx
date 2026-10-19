import React from "react";
import { AuthChipProps } from "@/features/auth/componentTypes";

export function AuthChip({ selected, onClick, label }: AuthChipProps) {
  const chipClassName = selected
    ? "border-blue-500 bg-blue-500/20 text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
    : "border-line bg-input text-fg-muted hover:text-fg hover:border-fg/20";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`h-9 px-3.5 rounded-[10px] text-[13px] font-medium border transition ${chipClassName}`}
    >
      {label}
    </button>
  );
}
