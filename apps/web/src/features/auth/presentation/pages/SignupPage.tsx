"use client";

import React from "react";
import { ButtonVariantEnum, InputTypeEnum } from "@/shared/enums";
import { Button } from "@/shared/presentation/components/Button";
import { Input } from "@/shared/presentation/components/Input";
import { COUNTRIES, CURRENCIES } from "../../constants";
import { useSignupForm } from "../../hooks/useSignupForm";
import { AuthField } from "../components/AuthField";
import { AuthFrame } from "../components/AuthFrame";

export function SignupPage() {
  const {
    fullName,
    setFullName,
    company,
    setCompany,
    country,
    currency,
    setCurrency,
    signedInEmail,
    isSubmitting,
    errorMessage,
    handleCountryChange,
    handleSignupSubmit,
  } = useSignupForm();

  const isSubmitDisabled = isSubmitting || fullName.trim() === "";
  const hasError = Boolean(errorMessage);
  const stepInfo = { current: 1, total: 4, label: "Your details" };

  return (
    <AuthFrame step={stepInfo} showSignOut={true} wide={false}>
      <form onSubmit={handleSignupSubmit} className="space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="text-sm text-fg-muted">
            {signedInEmail ? (
              <>
                Signed in as <span className="text-fg font-medium">{signedInEmail}</span>.{" "}
              </>
            ) : null}
            Tell us who will approve purchases your agents make.
          </p>
        </div>

        <div className="space-y-4">
          <AuthField label="Full name" hint={null}>
            <Input
              inputType={InputTypeEnum.Text}
              maxLength={80}
              value={fullName}
              onChange={setFullName}
              placeholder="Priya Sharma"
            />
          </AuthField>

          <AuthField label="Company" hint="Optional. Leave blank for personal use.">
            <Input
              inputType={InputTypeEnum.Text}
              maxLength={120}
              value={company}
              onChange={setCompany}
              placeholder="Acme Corp"
            />
          </AuthField>

          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <AuthField label="Country" hint={null}>
              <select
                value={country}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="saas-input h-11 rounded-xl px-3.5"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </AuthField>

            <AuthField label="Currency" hint={null}>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="saas-input h-11 rounded-xl px-3.5"
              >
                {CURRENCIES.map((c: string) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </AuthField>
          </div>
        </div>

        {hasError ? (
          <p role="alert" className="text-[13px] text-rose-400">
            {errorMessage}
          </p>
        ) : null}

        <Button
          variant={ButtonVariantEnum.Primary}
          type="submit"
          disabled={isSubmitDisabled}
          isLoading={isSubmitting}
          className="w-full h-11"
        >
          Continue
        </Button>
      </form>
    </AuthFrame>
  );
}
