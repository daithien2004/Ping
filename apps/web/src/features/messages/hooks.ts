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
import {
  listMessages,
  listMessagesAfter,
  sendMessage,
  editMessageRequest,
  deleteMessageRequest,
} from './api';
import { ApiError } from '@/lib/api-client';
import { useServerAbility } from '@/features/permissions/context';
import {
  type ClientMessage,
  type ClientMessagePage,
  type MessagesCache,
  markFailed,
  optimisticMessage,
  upsertMessage,
  updateMessage,
  deleteMessage,
  preserveLocalMessages,
  patchGap,
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

/**
 * Đồng bộ lại kênh khi `channel.join` thành công (kể cả sau reconnect): vá khoảng trống bằng
 * `?after=` từ tail cache (ADR-0044) thay vì refetch toàn bộ trang đã tải. Cache trống, tail là
 * tin optimistic hoặc lỗi giữa chừng → fallback `invalidateQueries` như hành vi trước T4.4.
 */
export function useChannelSync(channelId: string) {
  const queryClient = useQueryClient();
  return async () => {
    const key = qk.messages(channelId);
    await queryClient.cancelQueries({ queryKey: key, exact: true });
    // Trang 0 mới nhất trước: phần tử đầu là tin mới nhất client đã thấy.
    const tail = queryClient.getQueryData<MessagesCache>(key)?.pages[0]?.messages[0]?.id;
    if (!tail || tail.startsWith('temp-')) {
      await queryClient.invalidateQueries({ queryKey: key, exact: true });
      return;
    }
    try {
      const fetched: ClientMessage[] = [];
      let cursor = tail;
      for (;;) {
        const page = await listMessagesAfter(channelId, cursor);
        fetched.push(...page.messages);
        if (!page.hasMore || page.messages.length === 0) break;
        cursor = page.messages.at(-1)!.id;
      }
      // T4.5: sự kiện có thể RỚT GÓI khi vẫn còn kết nối (tail đã vượt qua tin bị mất, vòng
      // `?after=` không thấy nữa) — merge thêm trang mới nhất để vá lỗ hổng trong phạm vi 50
      // tin cuối. `prune: false`: trang mới nhất không đại diện toàn bộ khoảng, không được
      // dùng để kết luận "cached id nào đó đã bị xóa".
      const newest = await listMessages(channelId);
      const byId = new Map(fetched.map((message) => [message.id, message]));
      for (const message of newest.messages) byId.set(message.id, message);
      const combined = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      queryClient.setQueryData<MessagesCache>(key, (old) =>
        old ? patchGap(old, tail, combined) : old,
      );
    } catch {
      await queryClient.invalidateQueries({ queryKey: key, exact: true });
    }
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
