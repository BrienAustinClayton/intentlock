import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { HttpMethodEnum } from "@/shared/enums";
import { CreateOrUpdateRulePayload, SpendingRule } from "../types";

interface AgentBasicInfo {
  id: string;
  name: string;
  managed: boolean;
  revoked_at: string | null;
}

export function useSpendingRules() {
  const queryClient = useQueryClient();

  const rulesQuery = useQuery<SpendingRule[]>({
    queryKey: ["spendingRules"],
    queryFn: () =>
      makeApiCall<SpendingRule[]>({
        endpoint: "/api/me/mandates",
        method: HttpMethodEnum.Get,
      }),
  });

  const agentsQuery = useQuery<AgentBasicInfo[]>({
    queryKey: ["agentsListForRules"],
    queryFn: () =>
      makeApiCall<AgentBasicInfo[]>({
        endpoint: "/api/me/agents",
        method: HttpMethodEnum.Get,
      }),
  });

  const createRuleMutation = useMutation<SpendingRule, Error, CreateOrUpdateRulePayload>({
    mutationFn: (payload: CreateOrUpdateRulePayload) =>
      makeApiCall<SpendingRule, CreateOrUpdateRulePayload>({
        endpoint: "/api/me/mandates",
        method: HttpMethodEnum.Post,
        payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spendingRules"] });
    },
  });

  const updateRuleMutation = useMutation<
    SpendingRule,
    Error,
    { ruleId: string; payload: CreateOrUpdateRulePayload }
  >({
    mutationFn: ({ ruleId, payload }) =>
      makeApiCall<SpendingRule, CreateOrUpdateRulePayload>({
        endpoint: `/api/me/mandates/${encodeURIComponent(ruleId)}`,
        method: HttpMethodEnum.Patch,
        payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spendingRules"] });
    },
  });

  const revokeRuleMutation = useMutation<SpendingRule, Error, string>({
    mutationFn: (ruleId: string) =>
      makeApiCall<SpendingRule>({
        endpoint: `/api/me/mandates/${encodeURIComponent(ruleId)}/revoke`,
        method: HttpMethodEnum.Post,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spendingRules"] });
    },
  });

  return {
    rules: rulesQuery.data || [],
    isLoadingRules: rulesQuery.isLoading,
    agents: agentsQuery.data || [],
    isLoadingAgents: agentsQuery.isLoading,
    createRule: createRuleMutation.mutateAsync,
    isCreatingRule: createRuleMutation.isPending,
    updateRule: updateRuleMutation.mutateAsync,
    isUpdatingRule: updateRuleMutation.isPending,
    revokeRule: revokeRuleMutation.mutateAsync,
    isRevokingRule: revokeRuleMutation.isPending,
  };
}
