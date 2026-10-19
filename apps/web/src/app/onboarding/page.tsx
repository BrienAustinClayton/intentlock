"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthFrame, { Chip, Field, FormError, OptionCard, inputClass } from "@/components/auth/AuthFrame";
import { errorText, fetchMe, postJson, resetMe } from "@/lib/useMe";

const USE_CASES = [
  { id: "personal", title: "Personal shopping", description: "An assistant that buys things for me" },
  { id: "household", title: "Household and groceries", description: "Recurring orders for my home or family" },
  { id: "business", title: "Business purchasing", description: "Agents buying supplies or software for a team" },
  { id: "developer", title: "Building an agent", description: "I'm developing an agent that pays on users' behalf" },
] as const;

const CATEGORIES = [
  ["groceries", "Groceries"],
  ["household", "Household"],
  ["electronics", "Electronics"],
  ["fashion", "Fashion"],
  ["travel", "Travel"],
  ["software", "Software and subscriptions"],
  ["office", "Office supplies"],
  ["other", "Other"],
] as const;

const APPROVAL = [
  { id: "every", title: "Ask me before every purchase", description: "Safest. Nothing is paid until you approve." },
  { id: "above_limit", title: "Ask me above an amount", description: "Small orders inside your rules go through." },
  { id: "within_mandate", title: "Only ask when something looks wrong", description: "Pay automatically when an order matches your rules." },
] as const;

const AGENTS = [
  ["chatgpt", "ChatGPT"],
  ["claude", "Claude"],
  ["gemini", "Gemini"],
  ["custom", "Our own agent"],
  ["none", "Not using one yet"],
] as const;

type Part = 0 | 1 | 2;
const LABELS = ["What you'll use it for", "What your agents buy", "When to ask you"];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export default function OnboardingPage() {
  const router = useRouter();
  const [part, setPart] = useState<Part>(0);
  const [currency, setCurrency] = useState("USD");
  const [useCase, setUseCase] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [approval, setApproval] = useState<string | null>(null);
  const [limit, setLimit] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [referral, setReferral] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMe().then((me) => {
      if (live && me?.currency) setCurrency(me.currency);
    });
    return () => {
      live = false;
    };
  }, []);

  const canNext =
    part === 0
      ? !!useCase
      : part === 1
        ? categories.length > 0 && budget !== "" && Number(budget) >= 0
        : !!approval && (approval !== "above_limit" || Number(limit) >= 1);

  async function next(e: React.FormEvent) {
    e.preventDefault();
    if (!canNext || busy) return;
    setError(null);
    if (part < 2) return setPart((part + 1) as Part);
    setBusy(true);
    const { ok, data } = await postJson("/api/auth/onboarding", {
      use_case: useCase,
      categories,
      monthly_budget: Math.round(Number(budget)),
      approval_mode: approval,
      approval_limit: approval === "above_limit" ? Math.round(Number(limit)) : null,
      agents: agents.includes("none") ? ["none"] : agents,
      referral: referral.trim() || null,
    });
    if (!ok || typeof data.next !== "string") {
      setBusy(false);
      return setError(errorText(data));
    }
    resetMe();
    router.replace(data.next);
    router.refresh();
  }

  const money = (
    value: string,
    set: (v: string) => void,
    placeholder: string,
  ) => (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-fg-dim">{currency}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 7))}
        className={`${inputClass} pl-14`}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <AuthFrame step={{ current: part + 2, total: 4, label: LABELS[part] }} showSignOut wide>
      <form onSubmit={next} className="space-y-6">
        {part === 0 && (
          <>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">What brings you to Sepilo?</h1>
              <p className="text-sm text-fg-muted">We&apos;ll set up your checks around how your agents shop.</p>
            </div>
            <div className="grid gap-2.5">
              {USE_CASES.map((u) => (
                <OptionCard
                  key={u.id}
                  selected={useCase === u.id}
                  onClick={() => setUseCase(u.id)}
                  title={u.title}
                  description={u.description}
                />
              ))}
            </div>
          </>
        )}

        {part === 1 && (
          <>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">What will your agents buy?</h1>
              <p className="text-sm text-fg-muted">Purchases outside these categories will be held for you.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(([id, label]) => (
                <Chip
                  key={id}
                  label={label}
                  selected={categories.includes(id)}
                  onClick={() => setCategories((c) => toggle(c, id))}
                />
              ))}
            </div>
            <Field label="Monthly spending limit for agents" hint="You can change this later in your mandates.">
              {money(budget, setBudget, "500")}
            </Field>
          </>
        )}

        {part === 2 && (
          <>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">When should we ask you?</h1>
              <p className="text-sm text-fg-muted">
                Sepilo always blocks hidden instructions and wrong items. This sets when you approve.
              </p>
            </div>
            <div className="grid gap-2.5">
              {APPROVAL.map((a) => (
                <OptionCard
                  key={a.id}
                  selected={approval === a.id}
                  onClick={() => setApproval(a.id)}
                  title={a.title}
                  description={a.description}
                />
              ))}
            </div>
            {approval === "above_limit" && (
              <Field label="Ask me for orders above">{money(limit, setLimit, "50")}</Field>
            )}
            <div className="space-y-2">
              <span className="block text-[13px] font-medium text-fg-2">Which assistants will shop for you?</span>
              <div className="flex flex-wrap gap-2">
                {AGENTS.map(([id, label]) => (
                  <Chip
                    key={id}
                    label={label}
                    selected={agents.includes(id)}
                    onClick={() =>
                      setAgents((a) => (id === "none" ? (a.includes("none") ? [] : ["none"]) : toggle(a.filter((x) => x !== "none"), id)))
                    }
                  />
                ))}
              </div>
            </div>
            <Field label="How did you hear about us?" hint="Optional.">
              <input maxLength={120} value={referral} onChange={(e) => setReferral(e.target.value)} className={inputClass} />
            </Field>
          </>
        )}

        <FormError message={error} />
        <div className="flex items-center gap-3">
          {part > 0 && (
            <button type="button" onClick={() => setPart((part - 1) as Part)} className="intentlock-btn-outline h-11 px-5">
              Back
            </button>
          )}
          <button type="submit" disabled={!canNext || busy} className="intentlock-btn-primary h-11 flex-1">
            {part < 2 ? "Continue" : busy ? "Finishing…" : "Finish setup"}
          </button>
        </div>
      </form>
    </AuthFrame>
  );
}
