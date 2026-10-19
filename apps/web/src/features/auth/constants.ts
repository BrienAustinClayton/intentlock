import { ApprovalModeEnum } from "./enums";

export const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_state_mismatch: "That sign-in link expired. Try again.",
  google_not_configured: "Google sign-in isn't available yet. Use your email instead.",
  google_unavailable: "Google sign-in isn't available right now. Use your email instead.",
  account_conflict: "This email is linked to a different Google account.",
};

export const RESEND_COUNTDOWN_SECONDS = 30;

export const COUNTRIES: Array<{ code: string; label: string; currency: string }> = [
  { code: "US", label: "United States", currency: "USD" },
  { code: "IN", label: "India", currency: "INR" },
  { code: "GB", label: "United Kingdom", currency: "GBP" },
  { code: "CA", label: "Canada", currency: "CAD" },
  { code: "AU", label: "Australia", currency: "AUD" },
  { code: "SG", label: "Singapore", currency: "SGD" },
  { code: "AE", label: "United Arab Emirates", currency: "AED" },
  { code: "JP", label: "Japan", currency: "JPY" },
  { code: "DE", label: "Germany", currency: "EUR" },
  { code: "FR", label: "France", currency: "EUR" },
  { code: "ES", label: "Spain", currency: "EUR" },
  { code: "IT", label: "Italy", currency: "EUR" },
  { code: "NL", label: "Netherlands", currency: "EUR" },
  { code: "IE", label: "Ireland", currency: "EUR" },
];

export const CURRENCIES: string[] = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "CAD",
  "AUD",
  "SGD",
  "JPY",
  "AED",
];

export const USE_CASES: Array<{ id: string; title: string; description: string }> = [
  { id: "personal", title: "Personal shopping", description: "An assistant that buys things for me" },
  { id: "household", title: "Household and groceries", description: "Recurring orders for my home or family" },
  { id: "business", title: "Business purchasing", description: "Agents buying supplies or software for a team" },
  { id: "developer", title: "Building an agent", description: "I'm developing an agent that pays on users' behalf" },
];

export const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "groceries", label: "Groceries" },
  { id: "household", label: "Household" },
  { id: "electronics", label: "Electronics" },
  { id: "fashion", label: "Fashion" },
  { id: "travel", label: "Travel" },
  { id: "software", label: "Software and subscriptions" },
  { id: "office", label: "Office supplies" },
  { id: "other", label: "Other" },
];

export const APPROVAL_MODES: Array<{ id: ApprovalModeEnum; title: string; description: string }> = [
  { id: ApprovalModeEnum.Every, title: "Ask me before every purchase", description: "Safest. Nothing is paid until you approve." },
  { id: ApprovalModeEnum.AboveLimit, title: "Ask me above an amount", description: "Small orders inside your rules go through." },
  { id: ApprovalModeEnum.WithinMandate, title: "Only ask when something looks wrong", description: "Pay automatically when an order matches your rules." },
];

export const ONBOARDING_AGENTS: Array<{ id: string; label: string }> = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "custom", label: "Our own agent" },
  { id: "none", label: "Not using one yet" },
];

export const ONBOARDING_LABELS: string[] = [
  "What you'll use it for",
  "What your agents buy",
  "When to ask you",
];
