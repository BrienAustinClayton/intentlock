import { Suspense } from "react";
import PaymentClient from "./PaymentClient";

export const metadata = { title: "Payment method | Sepilo" };

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentClient />
    </Suspense>
  );
}
