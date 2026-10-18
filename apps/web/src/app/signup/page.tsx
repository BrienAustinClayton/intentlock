"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthFrame, { Field, FormError, inputClass } from "@/components/auth/AuthFrame";
import { errorText, fetchMe, postJson, resetMe } from "@/lib/useMe";

const COUNTRIES: [string, string, string][] = [
  ["US", "United States", "USD"],
  ["IN", "India", "INR"],
  ["GB", "United Kingdom", "GBP"],
  ["CA", "Canada", "CAD"],
  ["AU", "Australia", "AUD"],
  ["SG", "Singapore", "SGD"],
  ["AE", "United Arab Emirates", "AED"],
  ["JP", "Japan", "JPY"],
  ["DE", "Germany", "EUR"],
  ["FR", "France", "EUR"],
  ["ES", "Spain", "EUR"],
  ["IT", "Italy", "EUR"],
  ["NL", "Netherlands", "EUR"],
  ["IE", "Ireland", "EUR"],
];
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "SGD", "JPY", "AED"];

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("US");
  const [currency, setCurrency] = useState("USD");
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMe().then((me) => {
      if (!live || !me) return;
      setEmail(me.email);
      if (me.name && me.email && me.name !== me.email.split("@")[0]) setName(me.name);
      if (me.company) setCompany(me.company);
      if (me.country) setCountry(me.country);
      if (me.currency) setCurrency(me.currency);
    });
    return () => {
      live = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson("/api/auth/signup", {
      full_name: name,
      country,
      currency,
      company: company.trim() || null,
    });
    if (!ok || typeof data.next !== "string") {
      setBusy(false);
      return setError(errorText(data));
    }
    resetMe();
    router.replace(data.next);
  }

  return (
    <AuthFrame step={{ current: 1, total: 4, label: "Your details" }} showSignOut>
      <form onSubmit={submit} className="space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="text-sm text-fg-muted">
            {email ? (
              <>
                Signed in as <span className="text-fg font-medium">{email}</span>.{" "}
              </>
            ) : null}
            Tell us who will approve purchases your agents make.
          </p>
        </div>

        <div className="space-y-4">
          <Field label="Full name">
            <input
              required
              autoFocus
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Priya Sharma"
            />
          </Field>
          <Field label="Company" hint="Optional. Leave blank for personal use.">
            <input
              autoComplete="organization"
              maxLength={120}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field label="Country">
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  const c = COUNTRIES.find(([code]) => code === e.target.value);
                  if (c) setCurrency(c[2]);
                }}
                className={inputClass}
              >
                {COUNTRIES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <FormError message={error} />
        <button type="submit" disabled={busy || !name.trim()} className="intentlock-btn-primary w-full h-11">
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </AuthFrame>
  );
}
