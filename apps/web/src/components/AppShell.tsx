"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import Sidebar, { NavDrawer } from "@/components/Sidebar";
import TopHeader from "@/components/TopHeader";
import ApiHealthBanner from "@/components/ApiHealthBanner";

const BARE = ["/login", "/signup", "/onboarding"];
// Full-screen surfaces bring their own navigation (the chat opens the app menu from its own panel).
const FULL = ["/chat"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [menu, setMenu] = useState(false);
  if (BARE.includes(pathname) || FULL.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <div className="flex-1 min-h-dvh flex flex-col min-w-0">{children}</div>;
  }
  return (
    <>
      <Sidebar />
      <NavDrawer open={menu} onClose={() => setMenu(false)} />
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 min-h-dvh">
        <TopHeader onMenu={() => setMenu(true)} />
        <ApiHealthBanner />
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </>
  );
}
