'use client';

import {
  ServerEvents,
  type MessageCreatedPayload,
  type MessageDeletedPayload,
  type MessagePinnedPayload,
  type MessageUnpinnedPayload,
  type MessageUpdatedPayload,
  type ReactionChangedPayload,
  type ServerToClientEvents,
} from '@ping/shared';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useMe } from '@/features/auth/hooks';
import type { RealtimeSession } from '@/features/realtime/session';
import type { RealtimeSocket } from '@/features/realtime/socket';
import { qk } from '@/lib/query-keys';
import {
  applyPin,
  applyReaction,
  deleteMessage,
  updateMessage,
  upsertMessage,
} from '../message-cache';
import { writeMessages, type CacheChange } from './cache-ops';

type LooseSocket = {
  on: (event: string, handler: unknown) => void;
  off: (event: string, handler: unknown) => void;
};

function listen<E extends keyof ServerToClientEvents>(
  socket: RealtimeSocket,
  event: E,
  handler: ServerToClientEvents[E],
): () => void {
  const loose = socket as unknown as LooseSocket;
  loose.on(event, handler);
  return () => loose.off(event, handler);
}

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
    apply(event.channelId, (old) =>
      applyReaction(old, event.messageId, {
        emoji: event.emoji,
        count: event.count,
        me: event.userId === getMyId() ? active : undefined,
      }),
    );

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
      listen(session.socket, ServerEvents.MessageCreated, handlers.created),
      listen(session.socket, ServerEvents.MessageUpdated, handlers.updated),
      listen(session.socket, ServerEvents.MessageDeleted, handlers.deleted),
      listen(session.socket, ServerEvents.ReactionAdded, handlers.reactionAdded),
      listen(session.socket, ServerEvents.ReactionRemoved, handlers.reactionRemoved),
      listen(session.socket, ServerEvents.MessagePinned, handlers.pinned),
      listen(session.socket, ServerEvents.MessageUnpinned, handlers.unpinned),
    ];
    return () => off.forEach((stop) => stop());
  }, [session, queryClient]);
}
