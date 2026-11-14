'use client';

import type {
  AttachmentDto,
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
  preview?: {
    sticker?: MessageStickerPreview | null;
    gif?: MessageGifPreview | null;
    attachments?: AttachmentDto[];
  };
}

export function addOptimisticMessage(
  queryClient: QueryClient,
  channelId: string,
  author: MessageAuthor,
  { input, preview }: SendMessageVariables,
) {
  const key = qk.messages(channelId);
  const { gif } = input;
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
          content: input.content,
          nonce: input.nonce,
          attachments: preview?.attachments,
          ...(input.stickerId
            ? { stickerId: input.stickerId, sticker: preview?.sticker ?? null }
            : {}),
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
