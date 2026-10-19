import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiCallError } from "@/shared/api/ApiCallError";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { signInAgainFor } from "@/features/auth/utils";
import { HttpMethodEnum } from "@/shared/enums";
import { PaymentConnectionStatus, PaymentSetupResponse } from "../types";

export function usePaymentConnection() {
  const queryClient = useQueryClient();

  const paymentStatusQuery = useQuery<PaymentConnectionStatus>({
    queryKey: ["paymentStatus"],
    queryFn: () =>
      makeApiCall<PaymentConnectionStatus>({
        endpoint: "/api/me/payment",
        method: HttpMethodEnum.Get,
      }),
  });

  const setupPaymentMutation = useMutation<PaymentSetupResponse, Error, void>({
    // Changing the payment method needs a recent sign-in; an older session is sent to sign in again first.
    mutationFn: () =>
      makeApiCall<PaymentSetupResponse>({
        endpoint: "/api/me/payment/setup",
        method: HttpMethodEnum.Post,
      }).catch((error: unknown) => {
        if (error instanceof ApiCallError && error.errorCode === "reauth_required") {
          return signInAgainFor("/payment").then(() => Promise.reject(error));
        }
        return Promise.reject(error);
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["paymentStatus"] });
    },
  });

  return {
    isConnected: paymentStatusQuery.data?.connected || false,
    isLoadingStatus: paymentStatusQuery.isLoading,
    setupPayment: setupPaymentMutation.mutateAsync,
    isSettingUp: setupPaymentMutation.isPending,
  };
}
