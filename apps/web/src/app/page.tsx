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
    badge: "AI Verification",
    badgeType: "saas-badge-brand",
    desc: "Evaluates every cart line against the user's signed natural language request. Catches silent product swaps, unwanted bundles, and variant drift.",
    icon: (
      <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    title: "Multi-Layer Injection Shield",
    badge: "Threat Neutralization",
    badgeType: "saas-badge-danger",
    desc: "Scans merchant HTML for indirect prompt injections disguised in hidden CSS, zero-font spans, aria-hidden, and HTML comments before payment executes.",
    icon: (
      <svg className="h-5 w-5 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
    ),
  },
  {
    title: "Network Fraud Graph",
    badge: "Graph Intelligence",
    badgeType: "saas-badge-warning",
    desc: "In-memory NetworkX analysis detects compromised agent keys, bot-farm clustering, abnormal transaction velocity, and rogue merchant entities.",
    icon: (
      <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
  },
  {
    title: "Cryptographic Proof of Intent",
    badge: "Tamper-Evident",
    badgeType: "saas-badge-success",
    desc: "Generates an RFC 8785 canonical JSON bundle with Ed25519 digital signature recording every check, user mandate, and payment resolution.",
    icon: (
      <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
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
    <div className="flex flex-col gap-16 py-12 md:py-20">
      {/* 1. Hero Section */}
      <section className="mx-auto flex max-w-5xl flex-col items-center px-4 text-center sm:px-6 lg:px-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3.5 py-1 text-xs font-medium text-slate-700 shadow-xs dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 mb-6">
          <span className="flex h-2 w-2 rounded-full bg-indigo-500"></span>
          <span>Zero-Trust Autonomous AI Commerce Gateway</span>
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white max-w-4xl">
          Mandates check the rules. <br className="hidden sm:inline" />
          <span className="text-indigo-600 dark:text-indigo-400">IntentLock checks the meaning.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base sm:text-lg text-slate-600 dark:text-slate-400">
          The autonomous purchase verification layer that keeps AI shopping agents honest.
          Protects user funds against indirect prompt injection, silent product swaps, and out-of-intent transactions before payment captures.
        </p>

        {/* CTA Actions */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/lab"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            <span>Launch Attack Lab</span>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/wallet"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span>Wallet & Approvals</span>
          </Link>
          <Link
            href="/store/freshmart"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span>Demo Store</span>
          </Link>
        </div>

        {/* Metric Badges */}
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-3xl w-full">
          <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4 text-center dark:border-slate-800/80 dark:bg-slate-900/40">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">9 Gates</div>
            <div className="text-xs text-slate-500 mt-1">Deterministic Pipeline</div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4 text-center dark:border-slate-800/80 dark:bg-slate-900/40">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">&lt;450ms</div>
            <div className="text-xs text-slate-500 mt-1">Verification Latency</div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4 text-center dark:border-slate-800/80 dark:bg-slate-900/40">
            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">100%</div>
            <div className="text-xs text-slate-500 mt-1">Fail-Safe Policy</div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4 text-center dark:border-slate-800/80 dark:bg-slate-900/40">
            <div className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">Ed25519</div>
            <div className="text-xs text-slate-500 mt-1">RFC 9421 & 8785 Proof</div>
          </div>
        </div>
      </section>

      {/* 2. 9-Step Pipeline Stepper */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 sm:p-8 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-5 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Autonomous Checkout Verification Pipeline</h2>
              <p className="text-xs text-slate-500 mt-0.5">Every checkout executes through 7 security checks and 2 PayPal settlement gates.</p>
            </div>
            <Link
              href="/lab"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1"
            >
              Test Pipeline in Lab &rarr;
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-3">
            {PIPELINE_STEPS.map((s) => (
              <div
                key={s.step}
                className="flex flex-col rounded-lg border border-slate-200/60 bg-slate-50/50 p-3 text-left transition hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-950/40"
              >
                <span className="text-[10px] font-mono font-semibold text-slate-400">{s.step}</span>
                <span className="text-xs font-semibold text-slate-900 dark:text-white mt-1">{s.name}</span>
                <span className="text-[11px] text-slate-500 leading-tight mt-1">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Core Defense Pillars */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="mb-6">
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Enterprise Threat Defense Architecture</h2>
          <p className="text-sm text-slate-500 mt-1">Multi-layered security combining deterministic code policy with specialized AI decision models.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEFENSE_PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs transition hover:border-slate-300 dark:border-slate-800/80 dark:bg-slate-900/60 dark:hover:border-slate-700"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    {pillar.icon}
                  </div>
                  <span className={`saas-badge ${pillar.badgeType}`}>
                    {pillar.badge}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{pillar.title}</h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{pillar.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Attack Scenarios Matrix */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 sm:p-8 shadow-xs dark:border-slate-800/80 dark:bg-slate-900/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-5 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Attack Lab Threat Matrix</h2>
              <p className="text-xs text-slate-500 mt-0.5">Tested against adversarial prompt injection, fraud networks, and intent hijacking.</p>
            </div>
            <Link
              href="/lab"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
            >
              Run All Scenarios
            </Link>
          </div>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800/60">
            {SCENARIOS.map((sc) => {
              const badgeClass =
                sc.decision === "capture"
                  ? "saas-badge-success"
                  : sc.decision === "hold"
                  ? "saas-badge-warning"
                  : "saas-badge-danger";

              return (
                <div key={sc.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-medium text-slate-400 w-6">
                      {sc.id.slice(0, 3)}
                    </span>
                    <div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{sc.name}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{sc.trigger}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`saas-badge ${badgeClass} uppercase font-mono text-[11px]`}>
                      {sc.decision}
                    </span>
                    <Link
                      href={`/lab?scenario=${sc.id}`}
                      className="text-xs font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                    >
                      Run &rarr;
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
