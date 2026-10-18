"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const navSections = [
    {
      title: "Overview",
      items: [
        {
          href: "/",
          label: "Dashboard",
          exact: true,
          icon: (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
            </svg>
          ),
        },
        {
          href: "/lab",
          label: "Attack Lab",
          badge: "Live",
          badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
          icon: (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <circle cx="12" cy="11" r="3" />
            </svg>
          ),
        },
        {
          href: "/console",
          label: "Security Console",
          icon: (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "Autonomous operations",
      items: [
        {
          href: "/wallet/orders",
          label: "Orders & Holds",
          badge: "2 review",
          badgeColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
          icon: (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          ),
        },
        {
          href: "/schedule",
          label: "Purchase Schedule",
          icon: (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ),
        },
        {
          href: "/wallet/request",
          label: "Intent Requests",
          icon: (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          ),
        },
      ],
    },
    {
      title: "Agent fleet & intelligence",
      items: [
        {
          href: "/wallet",
          label: "AI Agents & Mandates",
          icon: (
            <svg className="w-4 h-4 shrink-0 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
          ),
        },
        {
          href: "/store/freshmart",
          label: "Merchant Stores",
          icon: (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          ),
        },
      ],
    },
  ];

  return (
    <aside
      className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col border-r border-[#1c1f28] bg-[#0d0e13] transition-all duration-200 select-none ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-[#1c1f28]">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm shadow-md shadow-indigo-500/25">
            IL
          </div>
          {!collapsed && (
            <div className="truncate">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-gray-100 tracking-tight">IntentLock</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-white/10 text-gray-400 border border-white/5">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-gray-500 truncate">Verification Gateway</p>
            </div>
          )}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
      </div>

      {/* Nav links grouped */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {!collapsed && (
              <h3 className="px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
            )}
            {section.items.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                    isActive
                      ? "bg-[#212430] text-white shadow-xs"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  }`}
                  title={item.label}
                >
                  <div className="flex items-center gap-3 truncate">
                    <span className={isActive ? "text-indigo-400" : "text-gray-400"}>
                      {item.icon}
                    </span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {!collapsed && item.badge && (
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${item.badgeColor}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Floating Status Checklist (Reference 2 Get Started Widget) */}
      {!collapsed && (
        <div className="mx-3 mb-3 p-3 rounded-xl border border-white/[0.08] bg-[#14161f] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-200">Gateway Status</span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          </div>
          <div className="space-y-1.5 text-[11px] text-gray-400">
            <div className="flex items-center gap-2 text-gray-300">
              <span className="text-emerald-400 text-xs">✓</span>
              <span>PayPal Vault active</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <span className="text-emerald-400 text-xs">✓</span>
              <span>Ed25519 signatures</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <span className="text-emerald-400 text-xs">✓</span>
              <span>Channel3 feed sync</span>
            </div>
          </div>
        </div>
      )}

      {/* User / Session Profile */}
      <div className="p-3 border-t border-[#1c1f28]">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 font-mono text-xs font-bold border border-indigo-500/20">
            P
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-200 truncate">Priya (Demo User)</div>
              <div className="text-[10px] text-gray-500 font-mono truncate">usr_demo_priya</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
