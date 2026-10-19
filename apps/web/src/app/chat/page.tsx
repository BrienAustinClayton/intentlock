import { Suspense } from "react";
import { ChatPage } from "@/features/chat/presentation/pages/ChatPage";

export const metadata = { title: "Shopping assistant | Sepilo" };

export default function Page() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}
