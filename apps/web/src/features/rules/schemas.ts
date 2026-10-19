import { z } from "zod";
import { RulePeriodEnum, RuleStoresSelectionEnum } from "./enums";

export const DOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?\.[a-z]{2,}$/;

export const spendingRuleFormSchema = z.object({
  agentId: z.string().trim().min(1, "Agent is required"),
  budget: z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter a valid budget amount")
    .refine((val: string) => Number(val) > 0, "Budget must be greater than 0"),
  period: z.nativeEnum(RulePeriodEnum),
  categories: z.array(z.string()).min(1, "Pick at least one category"),
  storesSelection: z.nativeEnum(RuleStoresSelectionEnum),
  storesText: z.string().trim(),
  expires: z.string().trim(),
});
