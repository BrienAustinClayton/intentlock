import { z } from "zod";

export const emailLoginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
});

export const verifyCodeSchema = z.object({
  code: z.string().length(6, "Code must be exactly 6 digits").regex(/^\d+$/, "Code must be numeric"),
});

export const signupFormSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(80),
  company: z.string().trim().max(120),
  country: z.string().min(2).max(2),
  currency: z.string().min(3).max(3),
});

export const onboardingPayloadSchema = z.object({
  useCase: z.string().min(1, "Please select an option"),
  categories: z.array(z.string()).min(1, "Please select at least one category"),
  monthlyBudget: z.number().min(0, "Budget must be positive"),
  approvalMode: z.string().min(1, "Please select an approval mode"),
  approvalLimit: z.number().nullable(),
  agents: z.array(z.string()),
  referral: z.string().max(120),
});
