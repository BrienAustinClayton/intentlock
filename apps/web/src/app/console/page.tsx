import Link from "next/link";

export default function ConsolePage() {
  return (
    <div className="mx-auto max-w-6xl w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
            <span>Risk Analyst & Intelligence</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Trust Console
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Real-time fraud telemetry, risk score histograms, and autonomous decision oversight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/lab"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition"
          >
            <span>Simulate in Lab</span>
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="saas-card p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Checkouts</span>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white">824</div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 block">
            ↑ 14% this month
          </span>
        </div>
        <div className="saas-card p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Avg Fraud Risk</span>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">14 / 100</div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Safe threshold (&lt;30)
          </span>
        </div>
        <div className="saas-card p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Neutralized Attacks</span>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">38</div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Prompt injection & bot farms
          </span>
        </div>
        <div className="saas-card p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Approval Holds</span>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">12</div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Variant drift & price spikes
          </span>
        </div>
      </div>

      {/* Decision Breakdown & Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="saas-card p-6 lg:col-span-2 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Policy Decision Distribution
          </h2>
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between font-medium mb-1">
                <span className="text-slate-700 dark:text-slate-300">Clean Captures (Direct Settlement)</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">89.2%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: "89.2%" }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between font-medium mb-1">
                <span className="text-slate-700 dark:text-slate-300">Human Approval Holds (30-min window)</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">6.4%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: "6.4%" }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between font-medium mb-1">
                <span className="text-slate-700 dark:text-slate-300">Prompt Injection Voids</span>
                <span className="font-mono text-rose-600 dark:text-rose-400">3.1%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: "3.1%" }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between font-medium mb-1">
                <span className="text-slate-700 dark:text-slate-300">Mandate & Access Rejections</span>
                <span className="font-mono text-rose-700 dark:text-rose-300">1.3%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-rose-700 rounded-full" style={{ width: "1.3%" }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Integration Status Box */}
        <div className="saas-card p-6 flex flex-col justify-between">
          <div>
            <span className="saas-badge saas-badge-brand text-[11px] mb-3">
              AG Studio Console
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Backend Metrics Connected
            </h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Metrics API (<code className="text-indigo-600 dark:text-indigo-400">GET /console/metrics</code>) and the Risk Analyst agent (<code className="text-indigo-600 dark:text-indigo-400">POST /graph/ask</code>) are operational on the backend.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400">
              AG Studio custom widgets will render directly into this layout once license is provisioned.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
