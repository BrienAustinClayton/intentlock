import { Suspense } from "react";
import { PaymentPage } from "@/features/payment/presentation/pages/PaymentPage";

export const metadata = { title: "Payment method | Sepilo" };

export default function Page() {
  return (
    <Suspense>
      <PaymentPage />
    </Suspense>
  );
}
