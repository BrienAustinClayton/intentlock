"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeft } from "lucide-react";
import ProfileMenu from "@/components/ProfileMenu";
import { NAV, findNav } from "@/lib/nav";

export default function Sidebar() {
  const pathname = usePathname() ?? "/";
  const [collapsed, setCollapsed] = useState(false);
  const active = findNav(pathname)?.item.href;

  return (
    <aside
      className={`sidebar-edge fixed top-0 bottom-0 left-0 z-40 flex flex-col bg-sidebar transition-all duration-200 select-none ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className={`flex items-center h-16 px-4 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <Link href="/" className="pl-2 text-[15px] font-semibold tracking-tight text-fg">
            Secay
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-fg-dim hover:text-fg hover:bg-fg/5 transition"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {NAV.map((section) => (
          <div key={section.title || "main"} className="space-y-0.5">
            {!collapsed && section.title && (
              <h3 className="px-3 pb-1.5 text-[11px] font-medium text-fg-dim">{section.title}</h3>
            )}
            {section.items.map(({ href, label, icon: Icon, soon }) => {
              const isActive = active === href;
              const base = `flex items-center gap-3 h-9 px-3 rounded-[10px] text-[13px] font-medium transition`;
              if (soon) {
                return (
                  <div key={href} title={`${label} is in development`} className={`${base} text-fg-muted opacity-50 cursor-default`}>
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                    {!collapsed && (
                      <>
                        <span className="truncate flex-1">{label}</span>
                        <span className="text-[10px] font-medium text-fg-dim">Soon</span>
                      </>
                    )}
                  </div>
                );
              }
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  title={label}
                  className={`${base} ${isActive ? "nav-item-active" : "text-fg-muted hover:text-fg hover:bg-fg/[0.04]"}`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-400" : "text-fg-dim"}`} strokeWidth={1.8} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 sidebar-edge-top">
        <ProfileMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}
