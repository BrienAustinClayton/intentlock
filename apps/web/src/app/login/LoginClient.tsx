"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthFrame, { FormError, inputClass } from "@/components/auth/AuthFrame";
import { errorText, postJson } from "@/lib/useMe";

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_state_mismatch: "That sign-in link expired. Try again.",
  google_not_configured: "Google sign-in isn't available yet. Use your email instead.",
  google_unavailable: "Google sign-in isn't available right now. Use your email instead.",
  account_conflict: "This email is linked to a different Google account.",
};

const RESEND_AFTER = 30;

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const urlError = params.get("error");

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? (GOOGLE_ERRORS[urlError] ?? "Google sign-in failed. Try again.") : null,
  );
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson("/api/auth/email/start", { email });
    setBusy(false);
    if (!ok) return setError(errorText(data));
    setStep("code");
    setCode("");
    setWait(RESEND_AFTER);
    setTimeout(() => codeRef.current?.focus(), 0);
  }

  async function verify(value: string) {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson("/api/auth/email/verify", { email, code: value, next });
    if (!ok || typeof data.next !== "string") {
      setBusy(false);
      setCode("");
      setError(errorText(data));
      codeRef.current?.focus();
      return;
    }
    router.replace(data.next);
    router.refresh();
  }

  const googleHref = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <AuthFrame>
      {step === "email" ? (
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to IntentLock</h1>
            <p className="text-sm text-fg-muted">New here? The same steps create your account.</p>
          </div>

          <a href={googleHref} className="intentlock-btn-outline w-full h-11 !text-sm">
            <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continue with Google
          </a>

          <div className="flex items-center gap-3 text-xs text-fg-dim">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={sendCode} className="space-y-3">
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-fg-2">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="you@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </label>
            <FormError message={error} />
            <button type="submit" disabled={busy || !email} className="intentlock-btn-primary w-full h-11">
              {busy ? "Sending code…" : "Email me a code"}
            </button>
          </form>

          <p className="text-xs text-fg-dim leading-relaxed">
            We&apos;ll email you a 6-digit code. No password needed.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
            <p className="text-sm text-fg-muted">
              We sent a 6-digit code to <span className="text-fg font-medium">{email}</span>. It expires in 10 minutes.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verify(code);
            }}
            className="space-y-3"
          >
            <input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="6-digit code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                if (v.length === 6) verify(v);
              }}
              className={`${inputClass} !h-14 text-center font-mono !text-2xl tracking-[0.5em] pl-[0.5em]`}
              placeholder="••••••"
            />
            <FormError message={error} />
            <button type="submit" disabled={busy || code.length !== 6} className="intentlock-btn-primary w-full h-11">
              {busy ? "Checking…" : "Continue"}
            </button>
          </form>
          <div className="flex items-center justify-between text-[13px]">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
              className="text-fg-muted hover:text-fg transition"
            >
              Use a different email
            </button>
            <button
              type="button"
              disabled={wait > 0 || busy}
              onClick={() => sendCode()}
              className="text-indigo-400 hover:text-indigo-300 disabled:text-fg-dim transition"
            >
              {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
            </button>
          </div>
        </div>
      )}
    </AuthFrame>
  );
}
