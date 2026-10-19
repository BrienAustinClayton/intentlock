import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { makeApiCall } from "@/shared/api/makeApiCall";
import { HttpMethodEnum } from "@/shared/enums";
import { ChatSummaryItem } from "../componentTypes";
import { ChatCartState, ChatMessageItem } from "../types";

export interface ActiveChatThread {
  id: string;
  title: string;
  rule_id: string | null;
  messages: ChatMessageItem[];
  cart: ChatCartState;
}

export function useChatSessions(activeChatId: string | null = null) {
  const queryClient = useQueryClient();

  const chatsListQuery = useQuery<ChatSummaryItem[]>({
    queryKey: ["chatList"],
    queryFn: () =>
      makeApiCall<ChatSummaryItem[]>({
        endpoint: "/api/me/chats",
        method: HttpMethodEnum.Get,
      }),
  });

  const shouldFetchThread = activeChatId !== null && activeChatId.length > 0;
  const activeChatQuery = useQuery<ActiveChatThread>({
    queryKey: ["chatThread", activeChatId],
    queryFn: () =>
      makeApiCall<ActiveChatThread>({
        endpoint: `/api/me/chats/${encodeURIComponent(activeChatId || "")}`,
        method: HttpMethodEnum.Get,
      }),
    enabled: shouldFetchThread,
  });

  const createChatMutation = useMutation<ChatSummaryItem, Error, { agentId?: string }>({
    mutationFn: (payload) =>
      makeApiCall<ChatSummaryItem, { agent_id?: string }>({
        endpoint: "/api/me/chats",
        method: HttpMethodEnum.Post,
        payload: { agent_id: payload.agentId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatList"] });
    },
  });

  const sendMessageMutation = useMutation<
    { messages: ChatMessageItem[]; title: string },
    Error,
    { chatId: string; content: string }
  >({
    mutationFn: ({ chatId, content }) =>
      makeApiCall<{ messages: ChatMessageItem[]; title: string }, { content: string }>({
        endpoint: `/api/me/chats/${encodeURIComponent(chatId)}/messages`,
        method: HttpMethodEnum.Post,
        payload: { content },
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["chatThread", variables.chatId] });
      queryClient.invalidateQueries({ queryKey: ["chatList"] });
    },
  });

  const addToCartMutation = useMutation<
    ChatCartState,
    Error,
    { chatId: string; messageId: string; productId: string }
  >({
    mutationFn: ({ chatId, messageId, productId }) =>
      makeApiCall<ChatCartState, { message_id: string; product_id: string }>({
        endpoint: `/api/me/chats/${encodeURIComponent(chatId)}/cart`,
        method: HttpMethodEnum.Post,
        payload: { message_id: messageId, product_id: productId },
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["chatThread", variables.chatId] });
    },
  });

  const setCartQtyMutation = useMutation<
    ChatCartState,
    Error,
    { chatId: string; productId: string; qty: number }
  >({
    mutationFn: ({ chatId, productId, qty }) =>
      makeApiCall<ChatCartState, { qty: number }>({
        endpoint: `/api/me/chats/${encodeURIComponent(chatId)}/cart/${encodeURIComponent(productId)}`,
        method: HttpMethodEnum.Patch,
        payload: { qty },
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["chatThread", variables.chatId] });
    },
  });

  const checkoutMutation = useMutation<
    { messages: ChatMessageItem[]; cart: ChatCartState },
    Error,
    string
  >({
    mutationFn: (chatId: string) =>
      makeApiCall<{ messages: ChatMessageItem[]; cart: ChatCartState }>({
        endpoint: `/api/me/chats/${encodeURIComponent(chatId)}/checkout`,
        method: HttpMethodEnum.Post,
      }),
    onSuccess: (_, chatId: string) => {
      queryClient.invalidateQueries({ queryKey: ["chatThread", chatId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const deleteChatMutation = useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (chatId: string) =>
      makeApiCall<{ ok: boolean }>({
        endpoint: `/api/me/chats/${encodeURIComponent(chatId)}`,
        method: HttpMethodEnum.Delete,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatList"] });
    },
  });

  return {
    chats: Array.isArray(chatsListQuery.data) ? chatsListQuery.data : [],
    isLoadingChats: chatsListQuery.isLoading,
    activeChat: activeChatQuery.data || null,
    isLoadingActiveChat: activeChatQuery.isLoading,
    createChat: createChatMutation.mutateAsync,
    isCreatingChat: createChatMutation.isPending,
    sendMessage: sendMessageMutation.mutateAsync,
    isSendingMessage: sendMessageMutation.isPending,
    addToCart: addToCartMutation.mutateAsync,
    isAddingToCart: addToCartMutation.isPending,
    setCartQty: setCartQtyMutation.mutateAsync,
    isSettingCartQty: setCartQtyMutation.isPending,
    checkout: checkoutMutation.mutateAsync,
    isCheckingOut: checkoutMutation.isPending,
    deleteChat: deleteChatMutation.mutateAsync,
    isDeletingChat: deleteChatMutation.isPending,
  };
}
