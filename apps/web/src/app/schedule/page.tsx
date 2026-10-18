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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono font-medium text-fg-muted uppercase tracking-wider block mb-1">
            Agent Mandate Timeline
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-fg">
            Purchase Schedule
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Automated recurring buying schedules synchronized with active spending mandates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/wallet"
            className="btn-approve-glow px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            Manage Mandates
          </Link>
        </div>
      </div>

      {/* Schedule Items Grid */}
      <div className="saas-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Configured Procurement Schedules
          </h2>
          <span className="font-mono text-xs text-fg-dim">
            CrudManager API: Ready
          </span>
        </div>

        <div className="divide-y divide-gray-100">
          {SAMPLE_SCHEDULES.map((s, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
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
                <div className="flex items-center gap-2 text-xs text-fg-dim">
                  <span>Merchant: <strong className="font-medium text-fg-faint">{s.merchant}</strong></span>
                  <span>•</span>
                  <span>Frequency: {s.cron}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-mono font-semibold text-xs text-gray-900">
                    {s.budget}
                  </div>
                  <div className="text-[11px] text-fg-muted">Mandate Cap</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bryntum Scheduler Integration Notice */}
      <div className="saas-card p-5 bg-gray-50/50">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-200/80 text-fg-faint">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Bryntum Scheduler Interactive Timeline
            </h3>
            <p className="mt-1 text-xs text-fg-faint leading-relaxed">
              Backend CrudManager sync endpoints (<code className="text-gray-800 font-mono text-[11px]">GET /schedule/load</code>, <code className="text-gray-800 font-mono text-[11px]">POST /schedule/sync</code>, and <code className="text-gray-800 font-mono text-[11px]">POST /schedule/propose</code>) are active. The interactive drag-and-drop timeline component embeds directly here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
