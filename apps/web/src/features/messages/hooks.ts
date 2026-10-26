'use client';

import {
  ServerEvents,
  type CreateMessageInput,
  type MessageCreatedPayload,
  type MessageUpdatedPayload,
  type MessageDeletedPayload,
  type ReactionChangedPayload,
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
  listMessagesAround,
  sendMessage,
  editMessageRequest,
  deleteMessageRequest,
  addReactionRequest,
  removeReactionRequest,
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
  prependNewer,
  replaceWithWindow,
  applyReaction,
  reactionsOf,
  setReactions,
  toggleReaction,
} from './message-cache';

/** Lịch sử tin theo trang (cursor `before`). Trang 0 mới nhất; fetchNextPage() lấy trang cũ hơn. */
export function useMessages(channelId: string) {
  // `TData` = MessagesCache (không chỉ InfiniteData) để nơi dùng đọc được `window` của permalink
  // TG.5 — thuộc tính phụ do structuralSharing/seed gắn vào cache.
  return useSuspenseInfiniteQuery<
    ClientMessagePage,
    Error,
    MessagesCache,
    readonly ['channels', string, 'messages'],
    string | undefined
  >({
    queryKey: qk.messages(channelId),
    queryFn: ({ pageParam }): Promise<ClientMessagePage> => listMessages(channelId, pageParam),
    initialPageParam: undefined,
    // Tin cuối trang là tin CŨ NHẤT của trang đó → con trỏ cho trang kế tiếp.
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages.at(-1)?.id : undefined),
    // Cửa sổ permalink (TG.5): refetch tự động của infinite query sẽ nạp lại các trang theo
    // pageParams (đều là `undefined` trong cửa sổ) và xóa `window`. Đồng bộ lại bằng
    // useChannelSync thay vì refetch ngầm.
    refetchOnWindowFocus: (query) => !(query.state.data as MessagesCache | undefined)?.window,
    refetchOnReconnect: (query) => !(query.state.data as MessagesCache | undefined)?.window,
    structuralSharing: (before, after) =>
      preserveLocalMessages(before as MessagesCache | undefined, after as MessagesCache),
  });
}

export interface EditMessageVariables extends UpdateMessageInput {
  id: string;
  beforeEditedAt: string | null;
}

/** TG.2: thả (`active`) hoặc gỡ cảm xúc của chính người xem. */
export interface ReactVariables {
  messageId: string;
  emoji: string;
  active: boolean;
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
    /**
     * TG.2: optimistic rồi hoà giải bằng response chuẩn (toàn bộ nhóm cảm xúc của tin). Lỗi
     * mạng/5xx có thể đã ghi ở server → invalidate; lỗi 4xx (thiếu quyền, emoji sai, quá 20
     * loại) thì hoàn tác đúng emoji đó, nhưng chỉ khi cache chưa bị writer khác sửa.
     */
    async react({ messageId, emoji, active }: ReactVariables) {
      const before = reactionsOf(queryClient.getQueryData<MessagesCache>(key), messageId).find(
        (row) => row.emoji === emoji,
      );
      const base = before?.count ?? 0;
      const optimisticCount = active
        ? before?.me
          ? base
          : base + 1
        : before?.me
          ? base - 1
          : base;
      await update((old) => toggleReaction(old, messageId, emoji, active));
      const optimistic = reactionsOf(queryClient.getQueryData<MessagesCache>(key), messageId);
      try {
        const summary = active
          ? await addReactionRequest(messageId, emoji)
          : await removeReactionRequest(messageId, emoji);
        let changed = false;
        await update((old) => {
          changed = reactionsOf(old, messageId) !== optimistic;
          return changed ? old : setReactions(old, messageId, summary.reactions);
        });
        // A socket event or another mutation may have arrived after this HTTP snapshot.
        if (changed) void queryClient.invalidateQueries({ queryKey: key, exact: true });
        return summary;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
          void queryClient.invalidateQueries({ queryKey: key, exact: true });
        } else {
          let changed = false;
          await update((old) => {
            const current = reactionsOf(old, messageId).find((row) => row.emoji === emoji);
            const untouched =
              (current?.me ?? false) === active && (current?.count ?? 0) === optimisticCount;
            changed = !untouched;
            return untouched ? toggleReaction(old, messageId, emoji, !active) : old;
          });
          if (changed) void queryClient.invalidateQueries({ queryKey: key, exact: true });
        }
        failed(error);
        throw error;
      }
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

/** TG.2: mutation thả/gỡ cảm xúc; UI disable đúng emoji đang chờ để đếm không nhảy loạn. */
export function useToggleReaction(channelId: string) {
  const { serverId } = useServerAbility();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: createMessageActions(queryClient, serverId, channelId).react });
}

/** The socket carries events; only domain hooks are allowed to write server cache. */
export function useMessageEvents(session: RealtimeSession) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
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
      void apply(event.channelId, (old) =>
        upsertMessage(old, { ...event, editedAt: null, reactions: [] }),
      );
    const updated = (event: MessageUpdatedPayload) =>
      void apply(event.channelId, (old) => updateMessage(old, event));
    const deleted = (event: MessageDeletedPayload) =>
      void apply(event.channelId, (old) => deleteMessage(old, event.id));
    // TG.2: count trong event là nguồn chuẩn. Chỉ đổi cờ `me` khi chính người xem là tác nhân —
    // event của người khác không được biến "tôi đã thả" thành true/false.
    const reacted = (event: ReactionChangedPayload, active: boolean) =>
      void apply(event.channelId, (old) =>
        applyReaction(old, event.messageId, {
          emoji: event.emoji,
          count: event.count,
          me: me && event.userId === me.id ? active : undefined,
        }),
      );
    const reactionAdded = (event: ReactionChangedPayload) => reacted(event, true);
    const reactionRemoved = (event: ReactionChangedPayload) => reacted(event, false);
    session.socket.on(ServerEvents.MessageCreated, created);
    session.socket.on(ServerEvents.MessageUpdated, updated);
    session.socket.on(ServerEvents.MessageDeleted, deleted);
    session.socket.on(ServerEvents.ReactionAdded, reactionAdded);
    session.socket.on(ServerEvents.ReactionRemoved, reactionRemoved);
    return () => {
      session.socket.off(ServerEvents.MessageCreated, created);
      session.socket.off(ServerEvents.MessageUpdated, updated);
      session.socket.off(ServerEvents.MessageDeleted, deleted);
      session.socket.off(ServerEvents.ReactionAdded, reactionAdded);
      session.socket.off(ServerEvents.ReactionRemoved, reactionRemoved);
    };
  }, [session, queryClient, me]);
}

/**
 * Đồng bộ lại kênh khi `channel.join` thành công (kể cả sau reconnect): vá khoảng trống bằng
 * `?after=` từ tail cache (ADR-0044) thay vì refetch toàn bộ trang đã tải. Cache trống, tail là
 * tin optimistic hoặc lỗi giữa chừng → fallback `invalidateQueries` như hành vi trước T4.4.
 *
 * TG.5: nếu cache đang là CỬA SỔ quanh tin đích của permalink thì nạp lại đúng cửa sổ đó (một
 * truy vấn keyset), không kéo cả lịch sử từ tin cũ tới hiện tại.
 */
export function useChannelSync(channelId: string) {
  const queryClient = useQueryClient();
  return async () => {
    const key = qk.messages(channelId);
    await queryClient.cancelQueries({ queryKey: key, exact: true });
    const cache = queryClient.getQueryData<MessagesCache>(key);
    if (cache?.window) {
      try {
        const page = await listMessagesAround(channelId, cache.window.aroundId);
        queryClient.setQueryData<MessagesCache>(key, (old) =>
          replaceWithWindow(old, page, cache.window!.aroundId),
        );
      } catch {
        // Tin đích đã bị xóa/không còn quyền: quay về trang mới nhất.
        await queryClient.invalidateQueries({ queryKey: key, exact: true });
      }
      return;
    }
    // Trang 0 mới nhất trước: phần tử đầu là tin mới nhất client đã thấy.
    const tail = cache?.pages[0]?.messages[0]?.id;
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
      queryClient.setQueryData<MessagesCache>(key, (old) => {
        // TG.5: cửa sổ permalink có thể được seed trong lúc chờ mạng ở trên (channel.join và
        // useSeedAround chạy song song khi mở permalink). Vá kiểu "nối tới hiện tại" vào cửa sổ sẽ
        // nhét cả trang mới nhất vào trang 0 — `pages[0].messages[0]` hoá thành tin mới nhất thật,
        // nút "Tải tin mới hơn" tưởng đã hết tin và biến mất. Bỏ qua: cửa sổ đã tự nạp đúng.
        if (!old || old.window) return old;
        return patchGap(old, tail, combined);
      });
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
        // TG.1: dựng preview từ tin đích đang có trong cache (server trả preview chuẩn khi xong).
        const target = input.replyToId
          ? oldestFirst(queryClient.getQueryData<MessagesCache>(key)).find(
              (message) => message.id === input.replyToId,
            )
          : undefined;
        update((old) =>
          upsertMessage(
            old,
            optimisticMessage(
              input,
              me,
              target
                ? {
                    id: target.id,
                    authorName: target.author.displayName,
                    content: target.content.slice(0, 120),
                    deleted: false,
                  }
                : null,
            ),
          ),
        );
      }
    },
    onSuccess: (message) => update((old) => upsertMessage(old, message)),
    onError: (_error, input) => update((old) => markFailed(old, input.nonce)),
  });
}

/**
 * TG.5: rời permalink về kênh bình thường → xóa cache đang là cửa sổ và nạp lại trang mới nhất.
 * `resetQueries` (không phải invalidate) vì `pageParams` của cửa sổ đều là `undefined`; refetch
 * từng trang theo các cursor đó sẽ nhân bản trang mới nhất.
 */
export function useResetWindow(channelId: string) {
  const queryClient = useQueryClient();
  return async () => {
    const key = qk.messages(channelId);
    if (!queryClient.getQueryData<MessagesCache>(key)?.window) return;
    await queryClient.resetQueries({ queryKey: key, exact: true });
  };
}

/**
 * TG.5: nạp cửa sổ quanh tin đích của permalink vào cache (thay trang mới nhất đang có).
 * Trả về `'missing'` khi tin không tồn tại/không còn quyền (API 404/403) để UI báo rõ thay vì treo.
 */
export function useSeedAround(channelId: string) {
  const queryClient = useQueryClient();
  return async (messageId: string): Promise<'ok' | 'missing'> => {
    const key = qk.messages(channelId);
    try {
      const page = await listMessagesAround(channelId, messageId);
      queryClient.setQueryData<MessagesCache>(key, (old) =>
        replaceWithWindow(old, page, messageId),
      );
      return 'ok';
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
        return 'missing';
      }
      throw error;
    }
  };
}

/**
 * TG.5: tải trang MỚI HƠN của cửa sổ permalink (nối dần tới tin mới nhất). Chỉ hoạt động khi
 * cache đang ở chế độ cửa sổ — cache thường đã có tin mới nhất nên không cần.
 */
export function useLoadNewer(channelId: string) {
  const queryClient = useQueryClient();
  return async (): Promise<void> => {
    const key = qk.messages(channelId);
    const cache = queryClient.getQueryData<MessagesCache>(key);
    const newest = cache?.pages[0]?.messages[0]?.id;
    if (!cache?.window || !newest) return;
    const page = await listMessagesAfter(channelId, newest);
    queryClient.setQueryData<MessagesCache>(key, (old) => prependNewer(old, page));
  };
}
