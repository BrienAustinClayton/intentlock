import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { HttpMethodEnum } from "@/shared/enums";
import {
  ConnectAgentPayload,
  CreateHostedAgentPayload,
  ShoppingAgent,
} from "../types";

export function useAgentsManagement() {
  const queryClient = useQueryClient();

  const agentsQuery = useQuery<ShoppingAgent[]>({
    queryKey: ["agents"],
    queryFn: () =>
      makeApiCall<ShoppingAgent[]>({
        endpoint: "/api/me/agents",
        method: HttpMethodEnum.Get,
      }),
  });

  const createHostedAgentMutation = useMutation<ShoppingAgent, Error, CreateHostedAgentPayload>({
    mutationFn: (payload: CreateHostedAgentPayload) =>
      makeApiCall<ShoppingAgent, CreateHostedAgentPayload>({
        endpoint: "/api/me/agents/hosted",
        method: HttpMethodEnum.Post,
        payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const connectAgentMutation = useMutation<ShoppingAgent, Error, ConnectAgentPayload>({
    mutationFn: (payload: ConnectAgentPayload) =>
      makeApiCall<ShoppingAgent, ConnectAgentPayload>({
        endpoint: "/api/me/agents",
        method: HttpMethodEnum.Post,
        payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const revokeAgentMutation = useMutation<ShoppingAgent, Error, string>({
    mutationFn: (agentId: string) =>
      makeApiCall<ShoppingAgent>({
        endpoint: `/api/me/agents/${encodeURIComponent(agentId)}/revoke`,
        method: HttpMethodEnum.Post,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  return {
    agents: Array.isArray(agentsQuery.data) ? agentsQuery.data : [],
    isLoadingAgents: agentsQuery.isLoading,
    createHostedAgent: createHostedAgentMutation.mutateAsync,
    isCreatingHostedAgent: createHostedAgentMutation.isPending,
    connectAgent: connectAgentMutation.mutateAsync,
    isConnectingAgent: connectAgentMutation.isPending,
    revokeAgent: revokeAgentMutation.mutateAsync,
    isRevokingAgent: revokeAgentMutation.isPending,
  };
}
