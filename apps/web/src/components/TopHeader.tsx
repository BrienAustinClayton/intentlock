"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TopHeader() {
  const pathname = usePathname();

  function getBreadcrumb() {
    if (pathname === "/") return "Command Center";
    if (pathname === "/lab") return "Attack Evaluation Lab";
    if (pathname === "/console") return "Security Console";
    if (pathname === "/schedule") return "Purchase Schedule";
    if (pathname?.startsWith("/wallet/orders")) return "Orders & Settlement Ledger";
    if (pathname?.startsWith("/wallet/request")) return "Agent Intent Request";
    if (pathname?.startsWith("/wallet")) return "AI Agents & Mandates";
    if (pathname?.startsWith("/store")) return "Merchant Catalog";
    if (pathname?.startsWith("/proof")) return "Proof of Intent";
    return "Gateway";
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 sm:px-8 border-b border-[#1c1f28] bg-[#0c0d12]/80 backdrop-blur-md">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500 font-medium">IntentLock</span>
        <span className="text-gray-700">/</span>
        <span className="text-gray-200 font-semibold">{getBreadcrumb()}</span>
      </div>

      {/* Search & Actions */}
      <div className="flex items-center gap-4">
        {/* Search bar matching Reference Image 1 */}
        <div className="relative hidden sm:flex items-center">
          <svg
            className="absolute left-3 w-3.5 h-3.5 text-gray-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search orders, agents, rules..."
            className="w-64 rounded-xl bg-[#161821] border border-white/[0.08] pl-9 pr-8 py-1.5 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-indigo-500/50 transition"
          />
          <kbd className="absolute right-2.5 px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-500 bg-white/5 border border-white/5">
            /
          </kbd>
        </div>

        {/* Engine status pills */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Channel3 Live</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-medium text-indigo-400">
            <span>Ed25519 Active</span>
          </div>
        </div>

        {/* GitHub link */}
        <a
          href="https://github.com/BrienAustinClayton/intentlock"
          target="_blank"
          rel="noreferrer"
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition"
          title="GitHub Repository"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </a>
      </div>
    </header>
  );
}
