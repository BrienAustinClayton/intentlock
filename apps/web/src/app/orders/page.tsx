import { Suspense } from "react";
import OrdersClient from "./OrdersClient";

export const metadata = { title: "Orders | Sepilo" };

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersClient />
    </Suspense>
  );
}
