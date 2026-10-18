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
    <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3 mb-6 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-medium transition shrink-0 ${
              isActive
                ? "bg-slate-200/80 text-slate-900 font-semibold dark:bg-slate-800 dark:text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
