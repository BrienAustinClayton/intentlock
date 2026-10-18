"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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

const icon = "w-4 h-4 shrink-0";
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export default function ProfileMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as Theme);

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

  const items = [
    {
      label: "Account & mandates",
      href: "/wallet",
      svg: (
        <svg className={icon} viewBox="0 0 24 24" {...stroke}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" />
        </svg>
      ),
    },
    {
      label: "Give feedback",
      href: `${REPO}/issues/new`,
      external: true,
      svg: (
        <svg className={icon} viewBox="0 0 24 24" {...stroke}>
          <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5 4V6a1 1 0 0 1 1-1z" />
        </svg>
      ),
    },
    {
      label: "About",
      href: REPO,
      external: true,
      svg: (
        <svg className={icon} viewBox="0 0 24 24" {...stroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      ),
    },
  ];

  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" className="popover absolute bottom-full left-0 mb-2 w-60 p-1.5 z-50">
          <div className="px-2.5 pt-2 pb-1.5 text-[11px] font-medium text-fg-dim">Theme</div>
          <div className="segmented mx-1.5 mb-2">
            {(["light", "dark"] as const).map((t) => (
              <button key={t} type="button" data-value={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>
                {t === "light" ? (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" {...stroke}>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" {...stroke}>
                    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
                  </svg>
                )}
                {t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
          <div className="h-px bg-line mx-1 my-1" />
          {items.map((it) => (
            <Link
              key={it.label}
              href={it.href}
              role="menuitem"
              target={it.external ? "_blank" : undefined}
              rel={it.external ? "noreferrer" : undefined}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] text-fg-2 hover:text-fg hover:bg-fg/[0.06] transition"
            >
              <span className="text-fg-dim">{it.svg}</span>
              {it.label}
            </Link>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`w-full flex items-center gap-3 p-2 rounded-xl transition hover:bg-fg/[0.05] ${open ? "bg-fg/[0.05]" : ""} ${collapsed ? "justify-center" : ""}`}
      >
        <span className="icon-tile icon-tile-brand !w-9 !h-9 !rounded-full text-sm font-semibold">P</span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[13px] font-semibold text-fg truncate">Priya</span>
              <span className="block text-xs text-fg-dim truncate">Account owner</span>
            </span>
            <svg className="w-4 h-4 text-fg-dim" viewBox="0 0 24 24" {...stroke}>
              <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}
