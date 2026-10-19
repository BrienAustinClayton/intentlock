"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HttpMethodEnum, ToastTypeEnum } from "@/shared/enums";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { showToast } from "@/shared/toast/toastManager";
import { COUNTRIES } from "../constants";
import { signupFormSchema } from "../schemas";
import { AuthApiResponse, AuthUserMe, SignupPayload } from "../types";

export function useSignupForm() {
  const router = useRouter();

  const [fullName, setFullName] = useState<string>("");
  const [company, setCompany] = useState<string>("");
  const [country, setCountry] = useState<string>("US");
  const [currency, setCurrency] = useState<string>("USD");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userData = await makeApiCall<AuthUserMe>({
          endpoint: "/api/auth/me",
          method: HttpMethodEnum.Get,
        });

        if (userData.email) {
          setSignedInEmail(userData.email);
        }

        const emailPrefix = userData.email ? userData.email.split("@")[0] : "";
        const isNameDistinctFromEmail = userData.name && userData.name !== emailPrefix;
        if (isNameDistinctFromEmail) {
          setFullName(userData.name);
        }
        if (userData.company) {
          setCompany(userData.company);
        }
        if (userData.country) {
          setCountry(userData.country);
        }
        if (userData.currency) {
          setCurrency(userData.currency);
        }
      } catch {
        // Unauthenticated or network error caught by makeApiCall
      }
    };

    loadCurrentUser();
  }, []);

  const handleCountryChange = (selectedCountryCode: string) => {
    setCountry(selectedCountryCode);
    const countryConfig = COUNTRIES.find((c) => c.code === selectedCountryCode);
    if (countryConfig) {
      setCurrency(countryConfig.currency);
    }
  };

  const handleSignupSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const validationResult = signupFormSchema.safeParse({
      fullName,
      company,
      country,
      currency,
    });

    const isValidationFailure = !validationResult.success;
    if (isValidationFailure) {
      const errorMsg = validationResult.error.issues[0]?.message || "Please check your inputs";
      setErrorMessage(errorMsg);
      showToast(errorMsg, ToastTypeEnum.Error);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: SignupPayload = {
      full_name: validationResult.data.fullName,
      country: validationResult.data.country,
      currency: validationResult.data.currency,
      company: validationResult.data.company || null,
    };

    try {
      const response = await makeApiCall<AuthApiResponse, SignupPayload>({
        endpoint: "/api/auth/signup",
        method: HttpMethodEnum.Post,
        payload,
      });

      showToast("Account details saved", ToastTypeEnum.Success);
      router.replace(response.next);
      router.refresh();
    } catch {
      setErrorMessage("Could not complete signup. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
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
  };
}
