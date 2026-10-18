import Link from "next/link";

const NAV_LINKS = [
  { href: "/store/freshmart", label: "Store" },
  { href: "/wallet", label: "Wallet" },
  { href: "/schedule", label: "Schedule" },
  { href: "/console", label: "Console" },
  { href: "/lab", label: "Lab" },
] as const;

export default function TopNav() {
  return (
    <header className="intentlock-topnav sticky top-0 z-50 backdrop-blur-sm">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        {/* Logo wordmark */}
        <Link
          href="/"
          aria-label="IntentLock home"
          className="intentlock-brand flex items-center gap-2 text-xl font-semibold tracking-tight"
        >
          IntentLock
        </Link>

        {/* Nav links */}
        <ul className="flex items-center gap-1 sm:gap-2" role="list">
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className="intentlock-nav-link rounded-md px-3 py-2 text-sm font-medium transition-colors">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
