"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, House } from "lucide-react";
import { findNav } from "@/lib/nav";

const DETAIL: Record<string, (id: string) => string> = {
  "/orders": (id) => `Order ${id.slice(-6).toUpperCase()}`,
};

export default function TopHeader() {
  const pathname = usePathname() ?? "/";
  const hit = findNav(pathname);
  const crumbs: { label: string; href?: string }[] = [];
  if (hit && hit.item.href !== "/") {
    if (hit.section) crumbs.push({ label: hit.section });
    const rest = pathname.slice(hit.item.href.length).split("/").filter(Boolean);
    if (rest.length) {
      crumbs.push({ label: hit.item.label, href: hit.item.href });
      const fmt = DETAIL[hit.item.href];
      crumbs.push({ label: fmt ? fmt(decodeURIComponent(rest[0])) : decodeURIComponent(rest[0]) });
    } else {
      crumbs.push({ label: hit.item.label });
    }
  } else if (pathname === "/") {
    crumbs.push({ label: "Home" });
  }

  return (
    <header className="header-edge sticky top-0 z-30 flex items-center h-16 px-6 sm:px-8 bg-canvas/85 backdrop-blur-md">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-[13px]">
          <li>
            <Link
              href="/"
              aria-label="Home"
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-dim hover:text-fg hover:bg-fg/5 transition"
            >
              <House className="w-4 h-4" strokeWidth={1.8} />
            </Link>
          </li>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className="flex items-center gap-1.5">
                <ChevronRight className="w-3.5 h-3.5 text-fg-faint" strokeWidth={2} />
                {last ? (
                  <span aria-current="page" className="font-medium text-blue-400">
                    {c.label}
                  </span>
                ) : c.href ? (
                  <Link href={c.href} className="text-fg-muted hover:text-fg transition">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-fg-muted">{c.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}
