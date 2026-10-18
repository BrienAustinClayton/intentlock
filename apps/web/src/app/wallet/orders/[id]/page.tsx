export const instant = false;

import { Suspense } from "react";
import OrderDetailClient from "./OrderDetailClient";

export default async function WalletOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl w-full px-6 py-10">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Loading order...
          </p>
        </div>
      }
    >
      <OrderDetailClient orderId={id} />
    </Suspense>
  );
}
