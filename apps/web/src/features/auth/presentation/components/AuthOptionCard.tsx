import React from "react";
import { AuthOptionCardProps } from "@/features/auth/componentTypes";

export function AuthOptionCard({
  selected,
  onClick,
  title,
  description,
}: AuthOptionCardProps) {
  const hasDescription = Boolean(description);
  const cardClassName = selected
    ? "border-blue-500 bg-blue-500/15 shadow-[0_0_0_3px_rgba(99,102,241,0.16)]"
    : "border-line bg-input hover:border-fg/20";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full text-left rounded-xl px-4 py-3 border transition ${cardClassName}`}
    >
      <span className="block text-sm font-medium text-fg">{title}</span>
      {hasDescription ? (
        <span className="block mt-0.5 text-xs text-fg-muted">{description}</span>
      ) : null}
    </button>
  );
}
