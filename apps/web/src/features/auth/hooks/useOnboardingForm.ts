"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HttpMethodEnum, ToastTypeEnum } from "@/shared/enums";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { showToast } from "@/shared/toast/toastManager";
import { ApprovalModeEnum, OnboardingStepEnum } from "../enums";
import { onboardingPayloadSchema } from "../schemas";
import { AuthApiResponse, AuthUserMe, OnboardingPayload } from "../types";
import { sanitizeDigits, toggleArrayItem } from "../utils";

export function useOnboardingForm() {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<OnboardingStepEnum>(OnboardingStepEnum.UseCase);
  const [currency, setCurrency] = useState<string>("USD");
  const [useCase, setUseCase] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [monthlyBudget, setMonthlyBudget] = useState<string>("");
  const [approvalMode, setApprovalMode] = useState<ApprovalModeEnum | null>(null);
  const [approvalLimit, setApprovalLimit] = useState<string>("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [referralSource, setReferralSource] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadCurrency = async () => {
      try {
        const userData = await makeApiCall<AuthUserMe>({
          endpoint: "/api/auth/me",
          method: HttpMethodEnum.Get,
        });
        if (userData.currency) {
          setCurrency(userData.currency);
        }
      } catch {
        // Fallback default USD retained
      }
    };

    loadCurrency();
  }, []);

  const isStepZeroValid = Boolean(useCase);
  const isStepOneValid =
    categories.length > 0 &&
    monthlyBudget.trim() !== "" &&
    Number(monthlyBudget) >= 0;

  const isAboveLimitMode = approvalMode === ApprovalModeEnum.AboveLimit;
  const isLimitValidForAbove = Number(approvalLimit) >= 1;
  const isStepTwoValid =
    Boolean(approvalMode) && (!isAboveLimitMode || isLimitValidForAbove);

  const canProceed =
    currentStep === OnboardingStepEnum.UseCase
      ? isStepZeroValid
      : currentStep === OnboardingStepEnum.Categories
        ? isStepOneValid
        : isStepTwoValid;

  const handleCategoryToggle = (categoryId: string) => {
    setCategories((prevCategories: string[]) =>
      toggleArrayItem(prevCategories, categoryId)
    );
  };

  const handleAgentToggle = (agentId: string) => {
    setSelectedAgents((prevAgents: string[]) => {
      const isNoneAgent = agentId === "none";
      if (isNoneAgent) {
        const wasNoneSelected = prevAgents.includes("none");
        return wasNoneSelected ? [] : ["none"];
      }
      const agentsWithoutNone = prevAgents.filter((id: string) => id !== "none");
      return toggleArrayItem(agentsWithoutNone, agentId);
    });
  };

  const handleBudgetChange = (raw: string) => {
    setMonthlyBudget(sanitizeDigits(raw, 7));
  };

  const handleLimitChange = (raw: string) => {
    setApprovalLimit(sanitizeDigits(raw, 7));
  };

  const goToPreviousStep = () => {
    if (currentStep === OnboardingStepEnum.Categories) {
      setCurrentStep(OnboardingStepEnum.UseCase);
    } else if (currentStep === OnboardingStepEnum.Approval) {
      setCurrentStep(OnboardingStepEnum.Categories);
    }
  };

  const handleNextOrSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canProceed || isSubmitting) return;

    setErrorMessage(null);

    const isFirstStep = currentStep === OnboardingStepEnum.UseCase;
    if (isFirstStep) {
      setCurrentStep(OnboardingStepEnum.Categories);
      return;
    }

    const isSecondStep = currentStep === OnboardingStepEnum.Categories;
    if (isSecondStep) {
      setCurrentStep(OnboardingStepEnum.Approval);
      return;
    }

    // Final step submission
    const limitNumeric = isAboveLimitMode ? Math.round(Number(approvalLimit)) : null;
    const finalPayload: OnboardingPayload = {
      use_case: useCase || "",
      categories,
      monthly_budget: Math.round(Number(monthlyBudget)),
      approval_mode: approvalMode || ApprovalModeEnum.Every,
      approval_limit: limitNumeric,
      agents: selectedAgents.includes("none") ? ["none"] : selectedAgents,
      referral: referralSource.trim() || null,
    };

    const validationResult = onboardingPayloadSchema.safeParse({
      useCase: finalPayload.use_case,
      categories: finalPayload.categories,
      monthlyBudget: finalPayload.monthly_budget,
      approvalMode: finalPayload.approval_mode,
      approvalLimit: finalPayload.approval_limit,
      agents: finalPayload.agents,
      referral: referralSource.trim(),
    });

    const isValidationFailure = !validationResult.success;
    if (isValidationFailure) {
      const errorMsg = validationResult.error.issues[0]?.message || "Please complete all required fields";
      setErrorMessage(errorMsg);
      showToast(errorMsg, ToastTypeEnum.Error);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await makeApiCall<AuthApiResponse, OnboardingPayload>({
        endpoint: "/api/auth/onboarding",
        method: HttpMethodEnum.Post,
        payload: finalPayload,
      });

      showToast("Onboarding complete! Welcome to Sepilo.", ToastTypeEnum.Success);
      router.replace(response.next);
      router.refresh();
    } catch {
      setErrorMessage("Could not complete onboarding. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    currentStep,
    currency,
    useCase,
    setUseCase,
    categories,
    handleCategoryToggle,
    monthlyBudget,
    handleBudgetChange,
    approvalMode,
    setApprovalMode,
    approvalLimit,
    handleLimitChange,
    selectedAgents,
    handleAgentToggle,
    referralSource,
    setReferralSource,
    isSubmitting,
    errorMessage,
    canProceed,
    goToPreviousStep,
    handleNextOrSubmit,
  };
}
