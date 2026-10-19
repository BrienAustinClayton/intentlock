import { SecurityCheckStepEnum } from "./enums";

export function formatCurrency(amount: string | number, currency: string = "USD"): string {
  const numericAmount = Number(amount);
  const isValidNumber = !isNaN(numericAmount);
  if (!isValidNumber) {
    return `${currency} 0.00`;
  }
  return `$${numericAmount.toFixed(2)}`;
}

export function calculateLineTotal(unitPrice: string, qty: number): string {
  const parts = unitPrice.split(".");
  const wholePart = parseInt(parts[0] || "0", 10);
  const fracStr = (parts[1] || "").padEnd(2, "0").slice(0, 2);
  const fracPart = parseInt(fracStr, 10);
  const priceCents = wholePart * 100 + fracPart;
  const totalCents = priceCents * qty;
  const dollars = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  return `${dollars}.${String(cents).padStart(2, "0")}`;
}

export function formatRelativeTime(isoString: string | null): string {
  if (isoString === null) {
    return "";
  }
  const date = new Date(isoString);
  const diffInSeconds = (Date.now() - date.getTime()) / 1000;
  const isJustNow = diffInSeconds < 60;
  if (isJustNow) {
    return "Just now";
  }
  const isWithinHour = diffInSeconds < 3600;
  if (isWithinHour) {
    return `${Math.floor(diffInSeconds / 60)} min ago`;
  }
  const isWithinDay = diffInSeconds < 86400;
  if (isWithinDay) {
    return `${Math.floor(diffInSeconds / 3600)} h ago`;
  }
  return date.toLocaleDateString();
}

export function getStepDisplayName(step: SecurityCheckStepEnum): string {
  const labels: Record<SecurityCheckStepEnum, string> = {
    [SecurityCheckStepEnum.VerifyAgent]: "Verify Agent",
    [SecurityCheckStepEnum.CheckMandate]: "Check Mandate",
    [SecurityCheckStepEnum.AuthorizePayment]: "Authorize Payment",
    [SecurityCheckStepEnum.ScanInjection]: "Scan Injection",
    [SecurityCheckStepEnum.IntentDiff]: "Intent Diff",
    [SecurityCheckStepEnum.GraphRisk]: "Graph Risk",
    [SecurityCheckStepEnum.Decide]: "Decide",
    [SecurityCheckStepEnum.CaptureOrVoid]: "Capture or Void",
    [SecurityCheckStepEnum.BuildProof]: "Build Proof",
  };
  return labels[step] || step;
}
