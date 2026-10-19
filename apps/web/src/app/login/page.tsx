import { Suspense } from "react";
import { LoginPage } from "@/features/auth/presentation/pages/LoginPage";

export const metadata = { title: "Sign in | Sepilo" };

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
