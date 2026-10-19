"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HttpMethodEnum, ToastTypeEnum } from "@/shared/enums";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { showToast } from "@/shared/toast/toastManager";
import { GOOGLE_ERRORS, RESEND_COUNTDOWN_SECONDS } from "../constants";
import { LoginStepEnum } from "../enums";
import { emailLoginSchema, verifyCodeSchema } from "../schemas";
import { AuthApiResponse, LoginVerifyPayload } from "../types";
import { sanitizeDigits } from "../utils";

export function useLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextTarget = searchParams.get("next") || "";
  const urlErrorCode = searchParams.get("error");

  const initialError = urlErrorCode
    ? GOOGLE_ERRORS[urlErrorCode] || "Google sign-in failed. Try again."
    : null;

  const [step, setStep] = useState<LoginStepEnum>(LoginStepEnum.Email);
  const [email, setEmail] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [resendCountdown, setResendCountdown] = useState<number>(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const isCountdownActive = resendCountdown > 0;
    if (!isCountdownActive) return;

    const timer = setTimeout(() => {
      setResendCountdown((previousCount: number) => previousCount - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const sendEmailCode = async (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }

    if (isSubmitting) return;

    const validationResult = emailLoginSchema.safeParse({ email });
    const isValidationFailure = !validationResult.success;
    if (isValidationFailure) {
      const errorMsg = validationResult.error.issues[0]?.message || "Invalid email address";
      setErrorMessage(errorMsg);
      showToast(errorMsg, ToastTypeEnum.Error);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await makeApiCall<{ ok: boolean }, { email: string }>({
        endpoint: "/api/auth/email/start",
        method: HttpMethodEnum.Post,
        payload: { email: validationResult.data.email },
      });

      setStep(LoginStepEnum.Code);
      setCode("");
      setResendCountdown(RESEND_COUNTDOWN_SECONDS);
      showToast("Verification code sent to your email", ToastTypeEnum.Success);
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch {
      setErrorMessage("Failed to send verification code. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyCode = async (candidateCode: string) => {
    const isInvalidLength = candidateCode.length !== 6;
    if (isSubmitting || isInvalidLength) return;

    const validationResult = verifyCodeSchema.safeParse({ code: candidateCode });
    const isValidationFailure = !validationResult.success;
    if (isValidationFailure) {
      const errorMsg = validationResult.error.issues[0]?.message || "Invalid code format";
      setErrorMessage(errorMsg);
      showToast(errorMsg, ToastTypeEnum.Error);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await makeApiCall<AuthApiResponse, LoginVerifyPayload>({
        endpoint: "/api/auth/email/verify",
        method: HttpMethodEnum.Post,
        payload: {
          email,
          code: candidateCode,
          next: nextTarget,
        },
      });

      showToast("Signed in successfully", ToastTypeEnum.Success);
      router.replace(response.next);
      router.refresh();
    } catch {
      setCode("");
      setErrorMessage("Invalid or expired code. Please try again.");
      codeInputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCodeChange = (rawValue: string) => {
    const cleanedCode = sanitizeDigits(rawValue, 6);
    setCode(cleanedCode);

    const isComplete = cleanedCode.length === 6;
    if (isComplete) {
      verifyCode(cleanedCode);
    }
  };

  const resetToEmailStep = () => {
    setStep(LoginStepEnum.Email);
    setErrorMessage(null);
  };

  const googleRedirectUrl = `/api/auth/google${
    nextTarget ? `?next=${encodeURIComponent(nextTarget)}` : ""
  }`;

  return {
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
    verifyCode,
    resetToEmailStep,
    googleRedirectUrl,
  };
}
