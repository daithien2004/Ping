'use client';

import type {
  CreateMessageInput,
  MessageAuthor,
  MessageGifPreview,
  MessageStickerPreview,
} from '@ping/shared';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMe } from '@/features/auth/hooks';
import { qk } from '@/lib/query-keys';
import { sendMessage } from '../api';
import {
  markFailed,
  oldestFirst,
  optimisticMessage,
  replyPreviewOf,
  upsertMessage,
  type MessagesCache,
} from '../message-cache';

export interface SendMessageVariables {
  input: CreateMessageInput;
  preview?: { sticker?: MessageStickerPreview | null; gif?: MessageGifPreview | null };
}

/**
 * Nhận nội dung gửi, channel và tác giả; thêm ngay một bản tin tạm vào cache trước khi API phản hồi.
 * Ví dụ: gửi `"Chào"` → danh sách lập tức có tin `{ content: 'Chào', status: 'sending' }`;
 * khi server trả lời, mutation sẽ thay bản tạm bằng tin thật hoặc đánh dấu gửi lỗi.
 */
export function addOptimisticMessage(
  queryClient: QueryClient,
  channelId: string,
  author: MessageAuthor,
  { input, preview }: SendMessageVariables,
) {
  const key = qk.messages(channelId);
  const { gif, ...rest } = input;
  const target = input.replyToId
    ? oldestFirst(queryClient.getQueryData<MessagesCache>(key)).find(
        (message) => message.id === input.replyToId,
      )
    : undefined;
  queryClient.setQueryData<MessagesCache>(key, (old) =>
    upsertMessage(
      old,
      optimisticMessage(
        {
          ...rest,
          ...(input.stickerId ? { sticker: preview?.sticker ?? null } : {}),
          ...(gif ? { gif: preview?.gif ?? null, gifId: gif.id } : {}),
        },
        author,
        target ? replyPreviewOf(target) : null,
      ),
    ),
  );
}

export function useSendMessage(channelId: string) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const key = qk.messages(channelId);
  const update = (change: (old: MessagesCache | undefined) => MessagesCache | undefined) =>
    queryClient.setQueryData<MessagesCache>(key, change);

  return useMutation({
    mutationFn: ({ input }: SendMessageVariables) => sendMessage(channelId, input),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: key });
      if (me) addOptimisticMessage(queryClient, channelId, me, variables);
    },
    onSuccess: (message) => update((old) => upsertMessage(old, message)),
    onError: (_error, { input }) => update((old) => markFailed(old, input.nonce)),
  });
}
