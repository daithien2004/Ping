'use client';

import type { UpdateMessageInput } from '@ping/shared';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useServerAbility } from '@/features/permissions/context';
import { ApiError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import {
  addReactionRequest,
  deleteMessageRequest,
  editMessageRequest,
  removeReactionRequest,
} from '../api';
import {
  applyReaction,
  applyReactionIntents,
  deleteMessage,
  oldestFirst,
  settleReactionIntent,
  startReactionIntent,
  toggleReaction,
  updateMessage,
  type MessagesCache,
} from '../message-cache';
import { isTransientError } from '../transient-error';
import { refetchMessages, writeMessages, type CacheChange } from './cache-ops';

export interface EditMessageVariables extends UpdateMessageInput {
  id: string;
  beforeEditedAt: string | null;
}

export interface ReactVariables {
  messageId: string;
  emoji: string;
  active: boolean;
}

export function createMessageActions(
  queryClient: QueryClient,
  serverId: string | null,
  channelId: string,
) {
  const key = qk.messages(channelId);
  const read = () => queryClient.getQueryData<MessagesCache>(key);
  const write = (change: CacheChange) => writeMessages(queryClient, channelId, change);
  const refetch = () => void refetchMessages(queryClient, channelId);
  const failed = (error: unknown) => {
    if (error instanceof ApiError && error.status === 403 && serverId !== null)
      void queryClient.invalidateQueries({ queryKey: qk.permissions(serverId), exact: true });
    if (isTransientError(error)) refetch();
  };

  return {
    async edit({ id, content, beforeEditedAt }: EditMessageVariables) {
      try {
        const message = await editMessageRequest(id, { content });
        await write((old) =>
          updateMessage(old, {
            id,
            channelId,
            content: message.content,
            updatedAt: message.editedAt ?? message.createdAt,
          }),
        );
        return message;
      } catch (error) {
        const confirmed = oldestFirst(read()).find(
          (row) => row.id === id && row.content === content && row.editedAt !== beforeEditedAt,
        );
        if (isTransientError(error) && confirmed) return confirmed;
        if (error instanceof ApiError && error.status === 404)
          await write((old) => deleteMessage(old, id));
        failed(error);
        throw error;
      }
    },

    async remove(id: string) {
      try {
        await deleteMessageRequest(id);
      } catch (error) {
        const confirmed = read()?.deletedIds?.includes(id);
        const alreadyGone =
          error instanceof ApiError &&
          (error.status === 404 || (isTransientError(error) && confirmed));
        if (!alreadyGone) {
          failed(error);
          throw error;
        }
      }
      await write((old) => deleteMessage(old, id));
    },

    async react({ messageId, emoji, active }: ReactVariables) {
      const token = startReactionIntent(messageId, emoji, active);
      queryClient.setQueryData<MessagesCache>(key, (old) => applyReactionIntents(old));

      try {
        const summary = active
          ? await addReactionRequest(messageId, emoji)
          : await removeReactionRequest(messageId, emoji);
        const settled = settleReactionIntent(messageId, emoji, token);
        // Event realtime cùng emoji đã là bản chuẩn (count sau thao tác); summary có thể cũ hơn.
        if (settled && !settled.sawEvent) {
          const row = summary.reactions.find((reaction) => reaction.emoji === emoji);
          await write((old) =>
            applyReaction(old, messageId, {
              emoji,
              count: row?.count ?? 0,
              me: row?.me ?? false,
            }),
          );
        }
        return summary;
      } catch (error) {
        const settled = settleReactionIntent(messageId, emoji, token);
        if (settled) {
          if (settled.sawEvent || isTransientError(error)) refetch();
          else await write((old) => toggleReaction(old, messageId, emoji, !active));
        }
        failed(error);
        throw error;
      }
    },
  };
}

function useActions(channelId: string) {
  const { serverId } = useServerAbility();
  const queryClient = useQueryClient();
  return createMessageActions(queryClient, serverId, channelId);
}

export function useEditMessage(channelId: string) {
  return useMutation({ mutationFn: useActions(channelId).edit });
}

export function useDeleteMessage(channelId: string) {
  return useMutation({ mutationFn: useActions(channelId).remove });
}

export function useToggleReaction(channelId: string) {
  return useMutation({ mutationFn: useActions(channelId).react });
}
