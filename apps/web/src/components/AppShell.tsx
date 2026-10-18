"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopHeader from "@/components/TopHeader";
import ApiHealthBanner from "@/components/ApiHealthBanner";

const BARE = ["/login", "/signup", "/onboarding"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (BARE.includes(pathname ?? "")) {
    return <div className="flex-1 min-h-screen flex flex-col">{children}</div>;
  }
  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pl-64 min-h-screen">
        <TopHeader />
        <ApiHealthBanner />
        <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </>
  );
}
