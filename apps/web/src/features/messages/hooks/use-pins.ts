'use client';

import type { MessagePinResult } from '@ping/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import { listPins, pinMessage, unpinMessage } from '../api';
import { applyPin, type MessagesCache } from '../message-cache';
import { refetchMessages } from './cache-ops';

export interface PinVariables {
  messageId: string;
  pin: boolean;
}

export function createPinActions(queryClient: QueryClient, channelId: string) {
  const key = qk.messages(channelId);
  const refreshPins = () => void queryClient.invalidateQueries({ queryKey: qk.pins(channelId) });
  return {
    async optimistic({ messageId, pin }: PinVariables) {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const snapshot = queryClient.getQueryData<MessagesCache>(key);
      queryClient.setQueryData<MessagesCache>(key, (old) =>
        applyPin(old, {
          messageId,
          pinnedAt: pin ? new Date().toISOString() : null,
          pinnedById: null,
        }),
      );
      return { snapshot };
    },
    confirm(result: MessagePinResult) {
      queryClient.setQueryData<MessagesCache>(key, (old) => applyPin(old, result));
      refreshPins();
    },
    rollback(snapshot: MessagesCache | undefined) {
      if (snapshot) {
        queryClient.setQueryData(key, snapshot);
      } else {
        void refetchMessages(queryClient, channelId);
      }
      refreshPins();
    },
  };
}

export function usePins(channelId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.pins(channelId),
    queryFn: () => listPins(channelId),
    enabled,
  });
}

export function useSetPinned(channelId: string) {
  const queryClient = useQueryClient();
  const actions = createPinActions(queryClient, channelId);
  return useMutation({
    mutationFn: ({ messageId, pin }: PinVariables) =>
      pin ? pinMessage(messageId) : unpinMessage(messageId),
    onMutate: actions.optimistic,
    onSuccess: actions.confirm,
    onError: (_error, _variables, context) => actions.rollback(context?.snapshot),
  });
}
