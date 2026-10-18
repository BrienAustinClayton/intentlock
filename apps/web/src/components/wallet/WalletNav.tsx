"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function WalletNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/wallet", label: "Mandates & Vault", exact: true },
    { href: "/wallet/orders", label: "Orders & Approvals", exact: false },
    { href: "/wallet/request", label: "Agent Intent Request", exact: true },
  ];

  return (
    <div className="flex items-center gap-1.5 border-b border-[#1c1f28] pb-3 mb-6 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-medium transition shrink-0 ${
              isActive
                ? "bg-[#212430] text-white font-semibold border border-white/10 shadow-xs"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
