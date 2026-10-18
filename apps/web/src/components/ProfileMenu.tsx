"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronsUpDown, CreditCard, Info, LogOut, MessageSquare, Moon, Sun } from "lucide-react";
import { signOut, useMe } from "@/lib/useMe";

type Theme = "light" | "dark";

function subscribeTheme(cb: () => void) {
  const o = new MutationObserver(cb);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => o.disconnect();
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("il-theme", t);
  } catch {}
}

const REPO = "https://github.com/BrienAustinClayton/intentlock";
const itemClass =
  "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] text-fg-2 hover:text-fg hover:bg-fg/[0.06] transition";

export default function ProfileMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as Theme);
  const me = useMe();
  const name = me?.name ?? "";
  const initial = (name || me?.email || "").trim().charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const icon = "w-4 h-4 text-fg-dim";

  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" className="popover absolute bottom-full left-0 mb-2 w-60 p-1.5 z-50">
          <div className="px-2.5 pt-2 pb-1.5 text-[11px] font-medium text-fg-dim">Theme</div>
          <div className="segmented mx-1.5 mb-2">
            {(["light", "dark"] as const).map((t) => {
              const Icon = t === "light" ? Sun : Moon;
              return (
                <button key={t} type="button" data-value={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                  {t === "light" ? "Light" : "Dark"}
                </button>
              );
            })}
          </div>
          <div className="h-px bg-line mx-1 my-1" />
          <Link href="/payment" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            <CreditCard className={icon} strokeWidth={1.8} />
            Payment method
          </Link>
          <a href={`${REPO}/issues/new`} target="_blank" rel="noreferrer" role="menuitem" className={itemClass}>
            <MessageSquare className={icon} strokeWidth={1.8} />
            Give feedback
          </a>
          <a href={REPO} target="_blank" rel="noreferrer" role="menuitem" className={itemClass}>
            <Info className={icon} strokeWidth={1.8} />
            About
          </a>
          <div className="h-px bg-line mx-1 my-1" />
          <button type="button" role="menuitem" onClick={signOut} className={itemClass}>
            <LogOut className={icon} strokeWidth={1.8} />
            Sign out
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`w-full flex items-center gap-3 p-2 rounded-xl transition hover:bg-fg/[0.05] ${open ? "bg-fg/[0.05]" : ""} ${collapsed ? "justify-center" : ""}`}
      >
        {me?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatar_url} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <span className="flex w-8 h-8 shrink-0 items-center justify-center rounded-full bg-fg/[0.08] text-[13px] font-medium text-fg-2">
            {initial}
          </span>
        )}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[13px] font-medium text-fg truncate">{name || " "}</span>
              <span className="block text-xs text-fg-dim truncate">{me?.email ?? " "}</span>
            </span>
            <ChevronsUpDown className="w-4 h-4 text-fg-dim" strokeWidth={1.8} />
          </>
        )}
      </button>
    </div>
  );
}
