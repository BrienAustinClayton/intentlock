"use client";

import React, { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Theme, readTheme, setTheme, subscribeTheme } from "@/shared/utils/theme";

export function ThemeSwitch({ collapsed = false }: { collapsed?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as Theme);

  if (collapsed) {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const Icon = theme === "dark" ? Moon : Sun;
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={`Switch to ${next} theme`}
        className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-fg-dim hover:text-fg hover:bg-fg/5 transition"
      >
        <Icon className="w-4 h-4" strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div className="segmented" role="group" aria-label="Theme">
      {(["light", "dark"] as const).map((option) => {
        const Icon = option === "light" ? Sun : Moon;
        return (
          <button key={option} type="button" data-value={option} aria-pressed={theme === option} onClick={() => setTheme(option)}>
            <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
            {option === "light" ? "Light" : "Dark"}
          </button>
        );
      })}
    </div>
  );
}
