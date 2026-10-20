'use client';

import {
  ServerEvents,
  type CreateMessageInput,
  type MessageCreatedPayload,
  type MessageUpdatedPayload,
  type MessageDeletedPayload,
  type UpdateMessageInput,
} from '@ping/shared';
import { useEffect } from 'react';
import type { RealtimeSession } from '@/features/realtime/session';
import {
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { useMe } from '@/features/auth/hooks';
import { qk } from '@/lib/query-keys';
import { listMessages, sendMessage, editMessageRequest, deleteMessageRequest } from './api';
import { ApiError } from '@/lib/api-client';
import { useServerAbility } from '@/features/permissions/context';
import {
  type ClientMessagePage,
  type MessagesCache,
  markFailed,
  optimisticMessage,
  upsertMessage,
  updateMessage,
  deleteMessage,
  preserveLocalMessages,
  oldestFirst,
} from './message-cache';

/** Lịch sử tin theo trang (cursor `before`). Trang 0 mới nhất; fetchNextPage() lấy trang cũ hơn. */
export function useMessages(channelId: string) {
  return useSuspenseInfiniteQuery({
    queryKey: qk.messages(channelId),
    queryFn: ({ pageParam }): Promise<ClientMessagePage> => listMessages(channelId, pageParam),
    initialPageParam: undefined as string | undefined,
    // Tin cuối trang là tin CŨ NHẤT của trang đó → con trỏ cho trang kế tiếp.
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages.at(-1)?.id : undefined),
    structuralSharing: (before, after) =>
      preserveLocalMessages(before as MessagesCache | undefined, after as MessagesCache),
  });
}

export interface EditMessageVariables extends UpdateMessageInput {
  id: string;
  beforeEditedAt: string | null;
}

/** Testable mutation operations; cache side effects stay in domain hooks. */
export function createMessageActions(
  queryClient: QueryClient,
  serverId: string,
  channelId: string,
) {
  const key = qk.messages(channelId);
  const update = async (change: (old: MessagesCache | undefined) => MessagesCache | undefined) => {
    const fetching = queryClient.getQueryState(key)?.fetchStatus === 'fetching';
    if (fetching) await queryClient.cancelQueries({ queryKey: key, exact: true });
    queryClient.setQueryData<MessagesCache>(key, change);
    if (fetching) void queryClient.invalidateQueries({ queryKey: key, exact: true });
  };
  const failed = (error: unknown) => {
    if (error instanceof ApiError && error.status === 403)
      void queryClient.invalidateQueries({ queryKey: qk.permissions(serverId), exact: true });
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500))
      void queryClient.invalidateQueries({ queryKey: key, exact: true });
  };
  return {
    async edit({ id, content, beforeEditedAt }: EditMessageVariables) {
      try {
        const message = await editMessageRequest(id, { content });
        await update((old) =>
          updateMessage(old, {
            id,
            channelId,
            content: message.content,
            updatedAt: message.editedAt ?? message.createdAt,
          }),
        );
        return message;
      } catch (error) {
        const confirmed = oldestFirst(queryClient.getQueryData<MessagesCache>(key)).find(
          (row) => row.id === id && row.content === content && row.editedAt !== beforeEditedAt,
        );
        if (error instanceof ApiError && (error.status === 0 || error.status >= 500) && confirmed)
          return confirmed;
        if (error instanceof ApiError && error.status === 404)
          await update((old) => deleteMessage(old, id));
        failed(error);
        throw error;
      }
    },
    async remove(id: string) {
      try {
        await deleteMessageRequest(id);
      } catch (error) {
        const confirmed = queryClient.getQueryData<MessagesCache>(key)?.deletedIds?.includes(id);
        if (!(
          error instanceof ApiError &&
          (error.status === 404 || ((error.status === 0 || error.status >= 500) && confirmed))
        )) {
          failed(error);
          throw error;
        }
      }
      await update((old) => deleteMessage(old, id));
    },
  };
}

export function useEditMessage(channelId: string) {
  const { serverId } = useServerAbility();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: createMessageActions(queryClient, serverId, channelId).edit });
}

export function useDeleteMessage(channelId: string) {
  const { serverId } = useServerAbility();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: createMessageActions(queryClient, serverId, channelId).remove });
}

/** The socket carries events; only domain hooks are allowed to write server cache. */
export function useMessageEvents(session: RealtimeSession) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const apply = async (
      channelId: string,
      update: (old: MessagesCache | undefined) => MessagesCache | undefined,
    ) => {
      const key = qk.messages(channelId);
      const fetching = queryClient.getQueryState(key)?.fetchStatus === 'fetching';
      if (fetching) await queryClient.cancelQueries({ queryKey: key, exact: true });
      if (!session.active) return;
      queryClient.setQueryData<MessagesCache>(key, update);
      // An event interrupted reconciliation: restart it rather than lose missed messages.
      if (fetching) void queryClient.invalidateQueries({ queryKey: key, exact: true });
    };
    const created = (event: MessageCreatedPayload) =>
      void apply(event.channelId, (old) => upsertMessage(old, { ...event, editedAt: null }));
    const updated = (event: MessageUpdatedPayload) =>
      void apply(event.channelId, (old) => updateMessage(old, event));
    const deleted = (event: MessageDeletedPayload) =>
      void apply(event.channelId, (old) => deleteMessage(old, event.id));
    session.socket.on(ServerEvents.MessageCreated, created);
    session.socket.on(ServerEvents.MessageUpdated, updated);
    session.socket.on(ServerEvents.MessageDeleted, deleted);
    return () => {
      session.socket.off(ServerEvents.MessageCreated, created);
      session.socket.off(ServerEvents.MessageUpdated, updated);
      session.socket.off(ServerEvents.MessageDeleted, deleted);
    };
  }, [session, queryClient]);
}

export function useChannelSync(channelId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.cancelQueries({ queryKey: qk.messages(channelId), exact: true });
    await queryClient.invalidateQueries({ queryKey: qk.messages(channelId), exact: true });
  };
}

/**
 * Gửi tin optimistic (hướng dẫn 12.3, 16.1). Người gọi sinh `nonce` MỘT lần cho mỗi tin và dùng
 * lại khi gửi lại: server chặn trùng theo (channel, author, nonce), cache khớp tin theo nonce.
 */
export function useSendMessage(channelId: string) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const key = qk.messages(channelId);
  const update = (fn: (old: MessagesCache | undefined) => MessagesCache | undefined) =>
    queryClient.setQueryData<MessagesCache>(key, fn);

  return useMutation({
    mutationFn: (input: CreateMessageInput) => sendMessage(channelId, input),
    onMutate: async (input) => {
      // Hủy refetch đang chạy: nó có thể trả về dữ liệu cũ và ghi đè mất tin tạm.
      await queryClient.cancelQueries({ queryKey: key });
      if (me) {
        // Gửi lại cùng nonce: tin "thất bại" được thay bằng tin "đang gửi" ngay tại chỗ.
        update((old) => upsertMessage(old, optimisticMessage(input, me)));
      }
    },
    onSuccess: (message) => update((old) => upsertMessage(old, message)),
    onError: (_error, input) => update((old) => markFailed(old, input.nonce)),
  });
}
