import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { makeApiCall } from "@/shared/api/makeApiCall";
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
    mutationFn: () =>
      makeApiCall<PaymentSetupResponse>({
        endpoint: "/api/me/payment/setup",
        method: HttpMethodEnum.Post,
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
