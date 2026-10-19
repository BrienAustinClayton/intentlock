import { Suspense } from "react";
import PaymentClient from "./PaymentClient";

export const metadata = { title: "Payment method | Secay" };

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentClient />
    </Suspense>
  );
}
