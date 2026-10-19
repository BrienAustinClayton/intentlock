export interface MonthStats {
  orders: number;
  paid: number;
  blocked: number;
  spent: string;
}

export interface DashboardSummary {
  currency: string;
  month: MonthStats;
  needs_approval: number;
  agents_active: number;
  rules_active: number;
  requests: number;
  payment_connected: boolean;
}

export interface StatCardProps {
  label: string;
  value: string;
  hint: string;
}

export interface SetupStep {
  done: boolean;
  label: string;
  body: string;
  href: string;
}
