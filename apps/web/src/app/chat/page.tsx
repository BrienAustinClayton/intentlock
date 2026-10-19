import { Suspense } from "react";
import ChatClient from "./ChatClient";

export const metadata = { title: "Shopping assistant | Secay" };

export default function ChatPage() {
  return (
    <Suspense>
      <ChatClient />
    </Suspense>
  );
}
