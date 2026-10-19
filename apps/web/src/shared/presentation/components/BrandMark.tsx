import React from "react";
import Image from "next/image";
import Link from "next/link";

interface BrandMarkProps {
  collapsed?: boolean;
  href?: string;
  onClick?: () => void;
}

export function BrandMark({ collapsed = false, href = "/", onClick }: BrandMarkProps) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 min-w-0" aria-label="Sepilo home">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white shadow-sm ring-1 ring-black/10">
        <Image src="/logo-64.png" alt="" width={22} height={22} unoptimized priority />
      </span>
      {!collapsed && <span className="text-[17px] font-semibold tracking-tight text-fg">Sepilo</span>}
    </Link>
  );
}
