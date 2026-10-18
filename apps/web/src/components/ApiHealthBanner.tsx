"use client";

import { useEffect, useState } from "react";
import { health } from "@/lib/api";

/**
 * Polls GET /health every 10 s.
 * Shows a sticky banner beneath the top nav when the API is unreachable.
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
      style={{
        position: "sticky",
        top: "3.5rem",
        zIndex: 40,
        padding: "0.6rem 1rem",
        background: "var(--color-danger-100)",
        borderBottom: "1px solid var(--color-danger-200)",
        color: "var(--color-status-voided)",
        fontSize: "0.875rem",
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.5rem",
      }}
    >
      <span>
        <strong>API unreachable.</strong> Some features may not work. Retrying every 10 s.
      </span>
      <button
        aria-label="Dismiss API down banner"
        onClick={() => setDismissed(true)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-status-voided)",
          fontWeight: 700,
          fontSize: "1.1rem",
          lineHeight: 1,
          padding: "0 0.25rem",
        }}
      >
        ×
      </button>
    </div>
  );
}
