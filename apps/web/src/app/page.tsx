import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-8 px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight" style={{ color: "var(--color-brand)" }}>
        IntentLock
      </h1>
      <p className="text-lg" style={{ color: "var(--color-text-muted)" }}>
        AI-powered autonomous purchase verification. Every agent order, signed
        and auditable.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/store/freshmart" className="intentlock-btn-primary">
          Demo Store
        </Link>
        <Link href="/wallet" className="intentlock-btn-outline">
          Wallet
        </Link>
        <Link href="/lab" className="intentlock-btn-outline">
          Attack Lab
        </Link>
      </div>
    </div>
  );
}
