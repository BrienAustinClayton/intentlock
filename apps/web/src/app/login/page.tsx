import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const metadata = { title: "Sign in | IntentLock" };

export default function LoginPage() {
  return (
    <Suspense>
      <LoginClient />
    </Suspense>
  );
}
