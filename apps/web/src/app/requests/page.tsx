import { Suspense } from "react";
import RequestsClient from "./RequestsClient";

export const metadata = { title: "Purchase requests | IntentLock" };

export default function RequestsPage() {
  return (
    <Suspense>
      <RequestsClient />
    </Suspense>
  );
}
