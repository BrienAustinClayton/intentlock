"use client";

import React from "react";
import { AuthFrameProps } from "@/features/auth/componentTypes";
import { handleSignOut } from "@/features/auth/utils";

export function AuthFrame({ children, step, showSignOut, wide }: AuthFrameProps) {
  const maxWidthClass = wide ? "max-w-xl" : "max-w-sm";
  const hasStep = Boolean(step);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between h-16 px-6 sm:px-10">
        <span className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-fg">Sepilo</span>
          <span className="hidden sm:inline text-xs text-fg-dim">Your secured PayPal agent</span>
        </span>
        {showSignOut ? (
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[13px] text-fg-dim hover:text-fg transition"
          >
            Sign out
          </button>
        ) : null}
      </header>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-16 pt-6">
        <div className={`w-full ${maxWidthClass}`}>
          {hasStep && step ? (
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs text-fg-dim mb-2">
                <span>{step.label}</span>
                <span>
                  Step {step.current} of {step.total}
                </span>
              </div>
              <div className="h-1 rounded-full bg-fg/7 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(step.current / step.total) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
