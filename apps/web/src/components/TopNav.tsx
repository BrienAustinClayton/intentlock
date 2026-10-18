"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/store/freshmart", label: "Store", match: "/store" },
  { href: "/wallet", label: "Wallet", match: "/wallet" },
  { href: "/lab", label: "Attack Lab", match: "/lab" },
  { href: "/console", label: "Console", match: "/console" },
  { href: "/schedule", label: "Schedule", match: "/schedule" },
] as const;

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header className="intentlock-topnav sticky top-0 z-50">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        {/* Left: Brand mark */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            aria-label="IntentLock home"
            className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
          >
            <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
              Intent<span className="text-indigo-600 dark:text-indigo-400">Lock</span>
            </span>
          </Link>

          {/* Navigation links */}
          <ul className="flex items-center gap-0.5" role="list">
            {NAV_LINKS.map(({ href, label, match }) => {
              const isActive = pathname === href || pathname?.startsWith(match);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Right: Minimal status */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            <span>Online</span>
          </div>
        </div>
      </nav>
    </header>
  );
}
