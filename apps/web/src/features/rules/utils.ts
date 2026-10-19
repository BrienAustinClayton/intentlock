import { RuleStatusEnum } from "./enums";
import { DOMAIN_REGEX } from "./schemas";
import { SpendingRule } from "./types";

export function parseStoreDomains(text: string): string[] {
  const segments = text.split(/[\s,]+/);
  const normalizedStores: string[] = [];

  segments.forEach((segment: string) => {
    const cleaned = segment
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");

    const isNonEmpty = cleaned.length > 0;
    const isAlreadyAdded = normalizedStores.includes(cleaned);
    const shouldAdd = isNonEmpty && !isAlreadyAdded;

    if (shouldAdd) {
      normalizedStores.push(cleaned);
    }
  });

  return normalizedStores;
}

export function isValidStoreDomain(domain: string): boolean {
  return DOMAIN_REGEX.test(domain);
}

export function determineRuleStatus(rule: SpendingRule): RuleStatusEnum {
  const isRevoked = Boolean(rule.revoked_at);
  if (isRevoked) {
    return RuleStatusEnum.Ended;
  }

  const hasExpiry = Boolean(rule.expires_at);
  if (hasExpiry && rule.expires_at) {
    const expiryTimestamp = new Date(rule.expires_at).getTime();
    const currentTimestamp = Date.now();
    const isExpired = expiryTimestamp < currentTimestamp;
    if (isExpired) {
      return RuleStatusEnum.Expired;
    }
  }

  return RuleStatusEnum.Active;
}
