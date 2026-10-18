import Link from "next/link";

export default function ConsolePage() {
  return (
    <div className="mx-auto max-w-5xl w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            Trust Console
          </h1>
          <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">
            Real-time fraud telemetry, risk scores, and autonomous decision oversight.
          </p>
        </div>
        <Link
          href="/lab"
          className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition"
        >
          Simulate in Lab
        </Link>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px border border-gray-200 rounded-lg overflow-hidden dark:border-gray-800">
        {[
          { label: "Total Checkouts", value: "824", trend: "↑ 14% this month", trendColor: "text-emerald-600 dark:text-emerald-400" },
          { label: "Avg Fraud Risk", value: "14 / 100", trend: "Safe threshold (<30)", trendColor: "text-gray-400" },
          { label: "Neutralized Attacks", value: "38", trend: "Prompt injection & bot farms", trendColor: "text-gray-400" },
          { label: "Approval Holds", value: "12", trend: "Variant drift & price spikes", trendColor: "text-gray-400" },
        ].map((m) => (
          <div key={m.label} className="bg-white p-5 border-r border-b border-gray-200 last:border-r-0 dark:bg-gray-900/50 dark:border-gray-800">
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{m.label}</span>
            <div className="mt-1.5 text-xl font-semibold font-mono text-gray-900 dark:text-white">{m.value}</div>
            <span className={`text-[11px] ${m.trendColor} mt-1 block`}>
              {m.trend}
            </span>
          </div>
        ))}
      </div>

      {/* Decision Breakdown & Integration Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border border-gray-200 rounded-lg p-5 lg:col-span-2 dark:border-gray-800">
          <h2 className="text-[13px] font-semibold text-gray-900 dark:text-white mb-4">
            Policy Decision Distribution
          </h2>
          <div className="space-y-3 text-[12px]">
            {[
              { label: "Clean Captures (Direct Settlement)", pct: "89.2%", width: "89.2%", color: "bg-emerald-500", textColor: "text-emerald-600 dark:text-emerald-400" },
              { label: "Human Approval Holds (30-min window)", pct: "6.4%", width: "6.4%", color: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-400" },
              { label: "Prompt Injection Voids", pct: "3.1%", width: "3.1%", color: "bg-rose-500", textColor: "text-rose-600 dark:text-rose-400" },
              { label: "Mandate & Access Rejections", pct: "1.3%", width: "1.3%", color: "bg-rose-700", textColor: "text-rose-700 dark:text-rose-300" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between font-medium mb-1">
                  <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
                  <span className={`font-mono ${item.textColor}`}>{item.pct}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className={`h-full ${item.color} rounded-full`} style={{ width: item.width }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Integration Status Box */}
        <div className="border border-gray-200 rounded-lg p-5 flex flex-col justify-between dark:border-gray-800">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900 dark:text-white">
              Backend Integration
            </h3>
            <p className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
              Metrics API (<code className="text-gray-700 dark:text-gray-300 text-[11px]">/console/metrics</code>) and Risk Analyst agent (<code className="text-gray-700 dark:text-gray-300 text-[11px]">/graph/ask</code>) are operational.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-[11px] text-gray-400">
              AG Studio widgets will render here once provisioned.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
