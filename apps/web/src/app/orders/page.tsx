import { Suspense } from "react";
import OrdersClient from "./OrdersClient";

export const metadata = { title: "Orders | IntentLock" };

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersClient />
    </Suspense>
  );
}
