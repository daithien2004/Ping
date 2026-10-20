'use client';

import type { CreateMessageInput } from '@ping/shared';
import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useMe } from '@/features/auth/hooks';
import { qk } from '@/lib/query-keys';
import { listMessages, sendMessage } from './api';
import {
  type ClientMessagePage,
  type MessagesCache,
  markFailed,
  optimisticMessage,
  upsertMessage,
} from './message-cache';

/** Lịch sử tin theo trang (cursor `before`). Trang 0 mới nhất; fetchNextPage() lấy trang cũ hơn. */
export function useMessages(channelId: string) {
  return useSuspenseInfiniteQuery({
    queryKey: qk.messages(channelId),
    queryFn: ({ pageParam }): Promise<ClientMessagePage> => listMessages(channelId, pageParam),
    initialPageParam: undefined as string | undefined,
    // Tin cuối trang là tin CŨ NHẤT của trang đó → con trỏ cho trang kế tiếp.
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages.at(-1)?.id : undefined),
  });
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
