/**
 * IntentLock status colour map.
 * CSS custom property values match tokens.css.
 * Reused by Bryntum and AG Studio.
 */

import type { OrderStatus, ScheduleEventStatus } from "./types";

export interface StatusStyle {
  /** CSS custom property (e.g. var(--color-status-captured)) */
  cssVar: string;
  /** Tailwind-friendly hex fallback (also used as chip background tint) */
  hex: string;
  /**
   * Accessible text colour for status chips.
   * When the hex is too light to meet WCAG AA (4.5:1) against a pale tint
   * background, supply a darker shade here.  Chips should use this for their
   * foreground colour and `hex + "22"` for the background.
   */
  chipTextHex?: string;
  label: string;
}

export const ORDER_STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  received: {
    cssVar: "var(--color-status-received)",
    hex: "#64748b",
    label: "Received",
  },
  authorized: {
    cssVar: "var(--color-status-authorized)",
    hex: "#6366f1",
    // #6366f1 on pale tint only yields ~3.6:1; use primary-700 (#4338ca) instead
    chipTextHex: "#4338ca",
    label: "Authorized",
  },
  checking: {
    cssVar: "var(--color-status-checking)",
    hex: "#818cf8",
    // #818cf8 on pale tint only yields ~4.4:1; use primary-700 (#4338ca) instead
    chipTextHex: "#4338ca",
    label: "Checking",
  },
  captured: {
    cssVar: "var(--color-status-captured)",
    hex: "#0d9488",
    label: "Captured",
  },
  voided: {
    cssVar: "var(--color-status-voided)",
    hex: "#e11d48",
    label: "Voided",
  },
  rejected: {
    cssVar: "var(--color-status-rejected)",
    hex: "#be123c",
    label: "Rejected",
  },
  pending_approval: {
    cssVar: "var(--color-status-pending-approval)",
    hex: "#d97706",
    // #d97706 on pale tint only yields ~2.6:1; use pending-800 (#92400e) instead
    chipTextHex: "#92400e",
    label: "Pending Approval",
  },
  failed: {
    cssVar: "var(--color-status-failed)",
    hex: "#9f1239",
    label: "Failed",
  },
};

export const SCHEDULE_STATUS_STYLES: Record<ScheduleEventStatus, StatusStyle> =
  {
    tentative: {
      cssVar: "var(--color-status-received)",
      hex: "#64748b",
      label: "Tentative",
    },
    confirmed: {
      cssVar: "var(--color-status-authorized)",
      hex: "#6366f1",
      chipTextHex: "#4338ca",
      label: "Confirmed",
    },
    captured: {
      cssVar: "var(--color-status-captured)",
      hex: "#0d9488",
      label: "Captured",
    },
    pending_approval: {
      cssVar: "var(--color-status-pending-approval)",
      hex: "#d97706",
      chipTextHex: "#92400e",
      label: "Pending Approval",
    },
    voided: {
      cssVar: "var(--color-status-voided)",
      hex: "#e11d48",
      label: "Voided",
    },
    rejected: {
      cssVar: "var(--color-status-rejected)",
      hex: "#be123c",
      label: "Rejected",
    },
  };

export function getOrderStatusStyle(status: OrderStatus): StatusStyle {
  return ORDER_STATUS_STYLES[status];
}

export function getScheduleStatusStyle(
  status: ScheduleEventStatus
): StatusStyle {
  return SCHEDULE_STATUS_STYLES[status];
}
