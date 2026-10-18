import Link from "next/link";

const SAMPLE_SCHEDULES = [
  {
    agent: "agt_demo_shopper",
    task: "Weekly Fresh Groceries Restock",
    merchant: "FreshMart",
    cron: "Every Tuesday at 09:00 AM",
    status: "Active",
    budget: "$80.00 USD",
  },
  {
    agent: "agt_demo_shopper",
    task: "Office Supplies & Tech Replenishment",
    merchant: "GadgetHub",
    cron: "1st of every month at 10:00 AM",
    status: "Active",
    budget: "$150.00 USD",
  },
  {
    agent: "agt_demo_shopper",
    task: "Clearance Deal Monitor",
    merchant: "DealsDaily",
    cron: "Every Friday at 06:00 PM",
    status: "Paused",
    budget: "$50.00 USD",
  },
];

export default function SchedulePage() {
  return (
    <div className="mx-auto max-w-6xl w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
            <span>Agent Mandate Timeline</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Agent Purchase Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Automated recurring buying schedules synchronized with active spending mandates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/wallet"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition"
          >
            <span>Manage Mandates</span>
          </Link>
        </div>
      </div>

      {/* Schedule Items Grid */}
      <div className="saas-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Configured Procurement Schedules
          </h2>
          <span className="font-mono text-xs text-slate-500">
            CrudManager API: Operational
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {SAMPLE_SCHEDULES.map((s, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between py-3.5 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {s.task}
                  </span>
                  <span
                    className={`saas-badge text-[10px] font-mono ${
                      s.status === "Active" ? "saas-badge-success" : "saas-badge-neutral"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>Merchant: <strong className="text-slate-700 dark:text-slate-300">{s.merchant}</strong></span>
                  <span>•</span>
                  <span>Frequency: {s.cron}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                    {s.budget}
                  </div>
                  <div className="text-[11px] text-slate-400">Mandate Cap</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bryntum Scheduler Integration Notice */}
      <div className="saas-card p-6 border-indigo-500/20 bg-indigo-50/10 dark:bg-slate-950/40">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Bryntum Scheduler Interactive Timeline
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Backend CrudManager sync endpoints (<code className="text-indigo-600 dark:text-indigo-400">GET /schedule/load</code>, <code className="text-indigo-600 dark:text-indigo-400">POST /schedule/sync</code>, and <code className="text-indigo-600 dark:text-indigo-400">POST /schedule/propose</code>) are tested and ready. The Bryntum interactive drag-and-drop timeline component will embed directly here upon trial license registration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
