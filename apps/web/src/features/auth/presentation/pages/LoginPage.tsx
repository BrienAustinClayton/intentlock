"use client";

import React from "react";
import { ButtonVariantEnum, InputTypeEnum } from "@/shared/enums";
import { Button } from "@/shared/presentation/components/Button";
import { Input } from "@/shared/presentation/components/Input";
import { LoginStepEnum } from "../../enums";
import { useLoginForm } from "../../hooks/useLoginForm";
import { AuthFrame } from "../components/AuthFrame";

export function LoginPage() {
  const {
    step,
    email,
    setEmail,
    code,
    handleCodeChange,
    isSubmitting,
    errorMessage,
    resendCountdown,
    codeInputRef,
    sendEmailCode,
    resetToEmailStep,
    googleRedirectUrl,
  } = useLoginForm();

  const isEmailStep = step === LoginStepEnum.Email;
  const isSendDisabled = isSubmitting || email.trim() === "";
  const isVerifyDisabled = isSubmitting || code.length !== 6;
  const hasError = Boolean(errorMessage);
  const isResendDisabled = resendCountdown > 0 || isSubmitting;

  return (
    <AuthFrame step={null} showSignOut={false} wide={false}>
      {isEmailStep ? (
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to Sepilo</h1>
            <p className="text-sm text-fg-muted">
              Your secured PayPal agent. New here? The same steps create your account.
            </p>
          </div>

          <a
            href={googleRedirectUrl}
            className="intentlock-btn-outline w-full h-11 text-sm! flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
              />
            </svg>
            Continue with Google
          </a>

          <div className="flex items-center gap-3 text-xs text-fg-dim">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={sendEmailCode} className="space-y-3">
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-fg-2">Email</span>
              <Input
                inputType={InputTypeEnum.Email}
                placeholder="you@gmail.com"
                value={email}
                onChange={setEmail}
                maxLength={100}
              />
            </label>

            {hasError ? (
              <p role="alert" className="text-[13px] text-rose-400">
                {errorMessage}
              </p>
            ) : null}

            <Button
              variant={ButtonVariantEnum.Primary}
              type="submit"
              disabled={isSendDisabled}
              isLoading={isSubmitting}
              className="w-full h-11"
            >
              Email me a code
            </Button>
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
              sendEmailCode();
            }}
            className="space-y-3"
          >
            <input
              ref={codeInputRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="6-digit code"
              maxLength={6}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              className="w-full h-14! rounded-xl bg-input border border-line px-3.5 text-center font-mono text-2xl! tracking-[0.5em] pl-[0.5em] text-fg placeholder:text-fg-dim focus:outline-none focus:border-blue-500/60 focus:ring-4 focus:ring-blue-500/10 transition"
              placeholder="••••••"
            />

            {hasError ? (
              <p role="alert" className="text-[13px] text-rose-400">
                {errorMessage}
              </p>
            ) : null}

            <Button
              variant={ButtonVariantEnum.Primary}
              type="submit"
              disabled={isVerifyDisabled}
              isLoading={isSubmitting}
              className="w-full h-11"
            >
              Continue
            </Button>
          </form>

          <div className="flex items-center justify-between text-[13px]">
            <button
              type="button"
              onClick={resetToEmailStep}
              className="text-fg-muted hover:text-fg transition"
            >
              Use a different email
            </button>
            <button
              type="button"
              disabled={isResendDisabled}
              onClick={() => sendEmailCode()}
              className="text-blue-400 hover:text-blue-300 disabled:text-fg-dim transition"
            >
              {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend code"}
            </button>
          </div>
        </div>
      )}
    </AuthFrame>
  );
}
