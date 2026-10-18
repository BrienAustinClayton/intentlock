import type { LucideIcon } from "lucide-react";
import type { OrderStatus } from "@/lib/types";

export const MERCHANTS: Record<string, string> = {
  freshmart: "FreshMart",
  gadgethub: "GadgetHub",
  dealsdaily: "DealsDaily",
};

export const CATEGORIES: Record<string, string> = {
  groceries: "Groceries",
  electronics_accessories: "Electronics and accessories",
  gift_cards: "Gift cards",
};

export const merchantName = (m: string) => MERCHANTS[m] ?? m;
export const categoryName = (c: string) => CATEGORIES[c] ?? c.replace(/_/g, " ");

type Tone = "success" | "warning" | "danger" | "neutral" | "brand";

const ORDER_TAG: Record<OrderStatus, [string, Tone]> = {
  received: ["Checking", "brand"],
  authorized: ["Checking", "brand"],
  checking: ["Checking", "brand"],
  pending_approval: ["Needs approval", "warning"],
  captured: ["Paid", "success"],
  voided: ["Blocked", "danger"],
  rejected: ["Rejected", "danger"],
  failed: ["Failed", "danger"],
};

export function Tag({ tone = "neutral", children, dot = false }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`saas-badge saas-badge-${tone}`}>
      {dot && <span className="tag-dot" />}
      {children}
    </span>
  );
}

export function OrderStatusTag({ status }: { status: OrderStatus }) {
  const [label, tone] = ORDER_TAG[status] ?? [status, "neutral"];
  return <Tag tone={tone}>{label}</Tag>;
}

export function money(amount: string | number, currency = "USD") {
  const n = typeof amount === "number" ? amount : Number(amount);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function when(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-fg-muted max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fg/[0.05] text-fg-muted mb-4">
        <Icon className="w-5 h-5" strokeWidth={1.8} />
      </span>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <p className="mt-1 text-sm text-fg-muted max-w-sm">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`saas-card overflow-hidden ${className}`}>{children}</div>;
}

export const th = "px-4 py-2.5 text-left text-xs font-medium text-fg-dim whitespace-nowrap";
export const td = "px-4 py-3 text-sm text-fg-2 align-middle";
export const tableClass = "w-full border-collapse";
export const theadClass = "border-b border-line bg-fg/[0.02]";
export const rowClass = "border-b border-line last:border-0 transition hover:bg-fg/[0.025]";

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-rose-400">
      {message}
    </p>
  );
}

export function SkeletonRows({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-line last:border-0">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className={td}>
              <span className="block h-3.5 rounded bg-fg/[0.06] animate-pulse" style={{ width: `${50 + ((r + c) % 4) * 12}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
