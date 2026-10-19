export const instant = false;

import { Suspense } from "react";
import { ServerOrderDetailPageProps } from "@/features/orders/pageTypes";
import { OrderDetailPage } from "@/features/orders/presentation/pages/OrderDetailPage";

export default async function Page({ params }: ServerOrderDetailPageProps) {
  const resolvedParams = await params;

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl w-full px-6 py-10">
          <p className="text-sm text-fg-muted">Loading order...</p>
        </div>
      }
    >
      <OrderDetailPage orderId={resolvedParams.id} />
    </Suspense>
  );
}
