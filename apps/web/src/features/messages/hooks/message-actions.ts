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
  deleteMessage,
  oldestFirst,
  reactionsOf,
  setReactions,
  toggledCount,
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

/** `serverId` là `null` trong DM: không có quyền theo server để làm tươi lại khi gặp 403. */
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
      const before = reactionsOf(read(), messageId).find((row) => row.emoji === emoji);
      const optimisticCount = toggledCount(before, active);
      await write((old) => toggleReaction(old, messageId, emoji, active));
      const optimistic = reactionsOf(read(), messageId);

      const rollback = async () => {
        let changed = false;
        await write((old) => {
          const current = reactionsOf(old, messageId).find((row) => row.emoji === emoji);
          const untouched =
            (current?.me ?? false) === active && (current?.count ?? 0) === optimisticCount;
          changed = !untouched;
          return untouched ? toggleReaction(old, messageId, emoji, !active) : old;
        });
        if (changed) refetch();
      };

      try {
        const summary = active
          ? await addReactionRequest(messageId, emoji)
          : await removeReactionRequest(messageId, emoji);
        let changed = false;
        await write((old) => {
          changed = reactionsOf(old, messageId) !== optimistic;
          return changed ? old : setReactions(old, messageId, summary.reactions);
        });
        if (changed) refetch();
        return summary;
      } catch (error) {
        if (isTransientError(error)) refetch();
        else await rollback();
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
