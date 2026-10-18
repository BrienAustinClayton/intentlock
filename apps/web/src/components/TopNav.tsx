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
        className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        {/* Left: Brand mark */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            aria-label="IntentLock home"
            className="flex items-center gap-2.5 font-semibold tracking-tight transition-opacity hover:opacity-90"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
              <svg
                className="h-4.5 w-4.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-slate-900 dark:text-white">
                Intent<span className="text-indigo-600 dark:text-indigo-400">Lock</span>
              </span>
            </div>
          </Link>

          {/* Navigation links */}
          <ul className="flex items-center gap-1" role="list">
            {NAV_LINKS.map(({ href, label, match }) => {
              const isActive = pathname === href || pathname?.startsWith(match);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                      isActive
                        ? "bg-slate-200/70 text-slate-900 font-semibold dark:bg-slate-800 dark:text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Right: Gateway Status Badge */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span>Gateway Ready</span>
          </div>

          <Link
            href="/lab"
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            <span>Run Lab</span>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </nav>
    </header>
  );
}
