export type AuthUserMe = {
  id: string;
  email: string | null;
  name: string;
  avatar_url: string | null;
  country: string | null;
  currency: string | null;
  company: string | null;
  next: string;
};

export type AuthApiResponse = {
  next: string;
  is_new: boolean | null;
};

export type LoginVerifyPayload = {
  email: string;
  code: string;
  next: string;
};

export type SignupPayload = {
  full_name: string;
  country: string;
  currency: string;
  company: string | null;
};

export type OnboardingPayload = {
  use_case: string;
  categories: string[];
  monthly_budget: number;
  approval_mode: string;
  approval_limit: number | null;
  agents: string[];
  referral: string | null;
};
