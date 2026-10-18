import React from "react";

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/** Animated placeholder bar used during data loading. */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{
        borderRadius: "4px",
        background: "var(--color-border)",
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

/** Pre-built skeleton that resembles an order list row. */
export function SkeletonRow() {
  return (
    <div
      className="rounded-lg border px-5 py-4"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <Skeleton style={{ height: "0.875rem", width: "55%" }} />
          <Skeleton style={{ height: "0.75rem", width: "40%" }} />
        </div>
        <div className="space-y-2 text-right shrink-0">
          <Skeleton style={{ height: "0.875rem", width: "4.5rem" }} />
          <Skeleton style={{ height: "0.75rem", width: "6rem" }} />
        </div>
      </div>
    </div>
  );
}

/** Pre-built skeleton block for section content. */
export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  const widths = ["70%", "90%", "60%", "80%", "50%"];
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          style={{ height: "0.875rem", width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}
