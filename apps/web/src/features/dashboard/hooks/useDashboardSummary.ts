import { useQuery } from "@tanstack/react-query";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { HttpMethodEnum } from "@/shared/enums";
import { DashboardSummary } from "../types";

export function useDashboardSummary() {
  const summaryQuery = useQuery<DashboardSummary>({
    queryKey: ["dashboardSummary"],
    queryFn: () =>
      makeApiCall<DashboardSummary>({
        endpoint: "/api/me/summary",
        method: HttpMethodEnum.Get,
      }),
  });

  return {
    summary: summaryQuery.data || null,
    isLoadingSummary: summaryQuery.isLoading,
  };
}
