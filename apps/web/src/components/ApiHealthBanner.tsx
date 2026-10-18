"use client";

import { useEffect, useState } from "react";
import { health } from "@/lib/api";

/**
 * Polls GET /health every 10 s.
 * Shows a clean SaaS warning banner beneath the top nav when the API is unreachable.
 */
export default function ApiHealthBanner() {
  const [apiDown, setApiDown] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        await health();
        if (mounted) setApiDown(false);
      } catch {
        if (mounted) setApiDown(true);
      }
    }

    check();
    const id = setInterval(check, 10_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (!apiDown || dismissed) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-14 z-40 flex items-center justify-between border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-700 backdrop-blur-md dark:border-rose-400/20 dark:bg-rose-950/60 dark:text-rose-300"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2">
        <svg
          className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>
          <strong>Backend Gateway Unreachable:</strong> Running in offline demo mode. Some checkout operations will use local fallbacks. Retrying every 10s.
        </span>
      </div>
      <button
        type="button"
        aria-label="Dismiss banner"
        onClick={() => setDismissed(true)}
        className="rounded p-1 text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-300"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
