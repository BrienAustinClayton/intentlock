"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeft, X } from "lucide-react";
import ProfileMenu from "@/components/ProfileMenu";
import { NAV, findNav } from "@/lib/nav";

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "/";
  const active = findNav(pathname)?.item.href;
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
      {NAV.map((section) => (
        <div key={section.title || "main"} className="space-y-0.5">
          {!collapsed && section.title && <h3 className="px-3 pb-1.5 text-[11px] font-medium text-fg-dim">{section.title}</h3>}
          {section.items.map(({ href, label, icon: Icon, soon }) => {
            const isActive = active === href;
            const base = "flex items-center gap-3 h-10 lg:h-9 px-3 rounded-[10px] text-[13px] font-medium transition";
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
                onClick={onNavigate}
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
  );
}

/** Desktop rail: fixed on large screens. */
export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={`sidebar-edge hidden lg:flex fixed top-0 bottom-0 left-0 z-40 flex-col bg-sidebar transition-all duration-200 select-none ${
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
      <NavLinks collapsed={collapsed} />
      <div className="p-3 sidebar-edge-top">
        <ProfileMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}

/** Slide-in app menu: phones and tablets everywhere, and inside the full-screen chat on every size. */
export function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="App menu"
        className={`sidebar-edge absolute top-0 bottom-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4">
          <Link href="/" onClick={onClose} className="pl-2 text-[15px] font-semibold tracking-tight text-fg">
            Secay
          </Link>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-fg-dim hover:text-fg hover:bg-fg/5" aria-label="Close menu">
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>
        <NavLinks collapsed={false} onNavigate={onClose} />
        <div className="p-3 sidebar-edge-top">
          <ProfileMenu collapsed={false} />
        </div>
      </aside>
    </div>
  );
}
