export const instant = false;

import { Suspense } from "react";
import WalletClient from "@/components/wallet/WalletClient";

export default function WalletPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-6 py-10">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Loading wallet...
          </p>
        </div>
      }
    >
      <WalletClient />
    </Suspense>
  );
}
