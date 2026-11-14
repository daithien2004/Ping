'use client';

import {
  ServerEvents,
  type MessageCreatedPayload,
  type MessageDeletedPayload,
  type MessagePinnedPayload,
  type MessageUnpinnedPayload,
  type MessageUpdatedPayload,
  type ReactionChangedPayload,
  type UserUpdatedPayload,
} from '@ping/shared';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useMe } from '@/features/auth/hooks';
import type { RealtimeSession } from '@/features/realtime/session';
import { onServerEvent } from '@/features/realtime/socket';
import { qk } from '@/lib/query-keys';
import {
  applyAuthorUpdated,
  applyPin,
  applyReaction,
  deleteMessage,
  noteReactionEvent,
  updateMessage,
  upsertMessage,
  type MessagesCache,
} from '../message-cache';
import { isMessagesKey, writeMessages, type CacheChange } from './cache-ops';

export function createMessageEventHandlers({
  queryClient,
  getMyId,
  isActive,
}: {
  queryClient: QueryClient;
  getMyId: () => string | undefined;
  isActive: () => boolean;
}) {
  const apply = (channelId: string, change: CacheChange) =>
    writeMessages(queryClient, channelId, change, isActive);
  const refreshPins = (channelId: string) =>
    void queryClient.invalidateQueries({ queryKey: qk.pins(channelId) });
  const reacted = (event: ReactionChangedPayload, active: boolean) =>
    apply(event.channelId, (old) => {
      noteReactionEvent(event.messageId, event.emoji);
      return applyReaction(old, event.messageId, {
        emoji: event.emoji,
        count: event.count,
        me: event.userId === getMyId() ? active : undefined,
      });
    });

  return {
    created: (event: MessageCreatedPayload) =>
      apply(event.channelId, (old) =>
        upsertMessage(old, {
          ...event,
          editedAt: null,
          reactions: [],
          pinnedAt: null,
          pinnedById: null,
        }),
      ),
    updated: (event: MessageUpdatedPayload) =>
      apply(event.channelId, (old) => updateMessage(old, event)),
    deleted: (event: MessageDeletedPayload) =>
      apply(event.channelId, (old) => deleteMessage(old, event.id)),
    reactionAdded: (event: ReactionChangedPayload) => reacted(event, true),
    reactionRemoved: (event: ReactionChangedPayload) => reacted(event, false),
    pinned: (event: MessagePinnedPayload) => {
      const done = apply(event.channelId, (old) => applyPin(old, event));
      refreshPins(event.channelId);
      return done;
    },
    unpinned: (event: MessageUnpinnedPayload) => {
      const done = apply(event.channelId, (old) =>
        applyPin(old, { messageId: event.messageId, pinnedAt: null, pinnedById: null }),
      );
      refreshPins(event.channelId);
      return done;
    },
    userUpdated: (event: UserUpdatedPayload) => {
      for (const query of queryClient
        .getQueryCache()
        .findAll({ type: 'active', predicate: (q) => isMessagesKey(q.queryKey) })) {
        queryClient.setQueryData<MessagesCache | undefined>(query.queryKey, (old) =>
          applyAuthorUpdated(old, event),
        );
      }
    },
  };
}

export function useMessageEvents(session: RealtimeSession) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const myId = useRef(me?.id);
  useEffect(() => {
    myId.current = me?.id;
  }, [me?.id]);

  useEffect(() => {
    const handlers = createMessageEventHandlers({
      queryClient,
      getMyId: () => myId.current,
      isActive: () => session.active,
    });
    const off = [
      onServerEvent(session.socket, ServerEvents.MessageCreated, handlers.created),
      onServerEvent(session.socket, ServerEvents.MessageUpdated, handlers.updated),
      onServerEvent(session.socket, ServerEvents.MessageDeleted, handlers.deleted),
      onServerEvent(session.socket, ServerEvents.ReactionAdded, handlers.reactionAdded),
      onServerEvent(session.socket, ServerEvents.ReactionRemoved, handlers.reactionRemoved),
      onServerEvent(session.socket, ServerEvents.MessagePinned, handlers.pinned),
      onServerEvent(session.socket, ServerEvents.MessageUnpinned, handlers.unpinned),
      onServerEvent(session.socket, ServerEvents.UserUpdated, handlers.userUpdated),
    ];
    return () => off.forEach((stop) => stop());
  }, [session, queryClient]);
}
