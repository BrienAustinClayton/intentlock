import Link from "next/link";

const PIPELINE_STEPS = [
  { step: "01", name: "Verify Agent", desc: "RFC 9421 Ed25519 signature & freshness" },
  { step: "02", name: "Check Mandate", desc: "Budget limits & merchant allow-list" },
  { step: "03", name: "PayPal Authorize", desc: "Temporary escrow hold on funds" },
  { step: "04", name: "Scan Injection", desc: "Hidden CSS, DOM & Prompt-Guard scan" },
  { step: "05", name: "Intent Diff", desc: "Semantic cart-to-request line analysis" },
  { step: "06", name: "Graph Risk", desc: "Bot farm & shared key fraud radar" },
  { step: "07", name: "Code Policy", desc: "Deterministic fail-safe code gates" },
  { step: "08", name: "Capture / Void", desc: "Final PayPal fund settlement" },
  { step: "09", name: "Proof of Intent", desc: "Cryptographic signed JSON bundle" },
];

const DEFENSE_PILLARS = [
  {
    title: "Semantic Intent Diff",
    desc: "Evaluates every cart line against the user's signed natural language request. Catches silent product swaps, unwanted bundles, and variant drift.",
  },
  {
    title: "Multi-Layer Injection Shield",
    desc: "Scans merchant HTML for indirect prompt injections disguised in hidden CSS, zero-font spans, aria-hidden, and HTML comments before payment executes.",
  },
  {
    title: "Network Fraud Graph",
    desc: "In-memory NetworkX analysis detects compromised agent keys, bot-farm clustering, abnormal transaction velocity, and rogue merchant entities.",
  },
  {
    title: "Cryptographic Proof of Intent",
    desc: "Generates an RFC 8785 canonical JSON bundle with Ed25519 digital signature recording every check, user mandate, and payment resolution.",
  },
];

const SCENARIOS = [
  { id: "normal", name: "Normal Purchase", decision: "capture", trigger: "Clean cart, clean page, verified mandate" },
  { id: "hidden_gift_card", name: "Hidden Gift Card", decision: "void", trigger: "Injection in CSS + unauthorized $500 item" },
  { id: "wrong_variant", name: "Wrong Variant", decision: "hold", trigger: "Item variant drift detected by Intent Diff" },
  { id: "overpriced_merchant", name: "Overpriced Merchant", decision: "hold", trigger: "Unit price anomaly against catalog cache" },
  { id: "bot_farm", name: "Bot Farm Attack", decision: "void", trigger: "Fraud graph detects repeated key usage across agents" },
  { id: "revoked_agent", name: "Revoked Agent", decision: "reject", trigger: "Cryptographic signature rejected prior to authorization" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12 py-10 md:py-16">
      {/* 1. Hero Section */}
      <section className="mx-auto flex max-w-5xl flex-col items-center px-4 text-center sm:px-6 lg:px-8">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-4">
          Zero-Trust Autonomous AI Commerce Gateway
        </p>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl dark:text-white max-w-3xl">
          Mandates check the rules. <br className="hidden sm:inline" />
          <span className="text-indigo-600 dark:text-indigo-400">IntentLock checks the meaning.</span>
        </h1>

        <p className="mt-4 max-w-xl text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          The autonomous purchase verification layer that keeps AI shopping agents honest.
          Protects user funds against indirect prompt injection, silent product swaps, and out-of-intent transactions.
        </p>

        {/* CTA Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/lab"
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            Launch Attack Lab
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/wallet"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Wallet & Approvals
          </Link>
          <Link
            href="/store/freshmart"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Demo Store
          </Link>
        </div>

        {/* Metric Badges */}
        <div className="mt-10 grid grid-cols-2 gap-px sm:grid-cols-4 max-w-2xl w-full border border-gray-200 rounded-lg overflow-hidden dark:border-gray-800">
          {[
            { value: "9 Gates", label: "Deterministic Pipeline" },
            { value: "<450ms", label: "Verification Latency" },
            { value: "100%", label: "Fail-Safe Policy" },
            { value: "Ed25519", label: "RFC 9421 & 8785 Proof" },
          ].map((m) => (
            <div key={m.label} className="bg-white p-4 text-center border-r border-b border-gray-200 last:border-r-0 dark:bg-gray-900 dark:border-gray-800">
              <div className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white font-mono">{m.value}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. 9-Step Pipeline Stepper */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="border border-gray-200 rounded-lg p-5 dark:border-gray-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-4 dark:border-gray-800">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Verification Pipeline</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">7 security checks and 2 PayPal settlement gates per checkout.</p>
            </div>
            <Link
              href="/lab"
              className="text-[11px] font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Test in Lab →
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-2">
            {PIPELINE_STEPS.map((s) => (
              <div
                key={s.step}
                className="flex flex-col border-l-2 border-gray-200 pl-3 py-2 dark:border-gray-700"
              >
                <span className="text-[10px] font-mono font-medium text-gray-300 dark:text-gray-600">{s.step}</span>
                <span className="text-[12px] font-medium text-gray-900 dark:text-white mt-0.5">{s.name}</span>
                <span className="text-[10px] text-gray-400 leading-tight mt-0.5">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Core Defense Pillars */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Threat Defense Architecture</h2>
          <p className="text-xs text-gray-400 mt-0.5">Multi-layered security combining deterministic code policy with specialized AI decision models.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DEFENSE_PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="border border-gray-200 rounded-lg p-5 dark:border-gray-800"
            >
              <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">{pillar.title}</h3>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{pillar.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Attack Scenarios Matrix */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="border border-gray-200 rounded-lg p-5 dark:border-gray-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-4 dark:border-gray-800">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Attack Lab Scenarios</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">6 adversarial vectors tested against the verification pipeline.</p>
            </div>
            <Link
              href="/lab"
              className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition"
            >
              Run All Scenarios
            </Link>
          </div>

          <div className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
            {SCENARIOS.map((sc) => {
              const color =
                sc.decision === "capture"
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900"
                  : sc.decision === "hold"
                  ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900"
                  : "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900";

              return (
                <div key={sc.id} className="flex items-center justify-between py-3 gap-2">
                  <div>
                    <span className="text-[13px] font-medium text-gray-900 dark:text-white">{sc.name}</span>
                    <p className="text-[11px] text-gray-400 mt-0.5">{sc.trigger}</p>
                  </div>
                  <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-mono font-semibold uppercase ${color}`}>
                    {sc.decision}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
