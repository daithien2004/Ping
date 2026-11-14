'use client';
import {
  ServerEvents,
  type CreateCustomEmojiInput,
  type CustomEmojiDto,
  type CustomEmojiListResponse,
  type ExpressionsUpdatedPayload,
} from '@ping/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useMemo } from 'react';
import type { RealtimeSession } from '@/features/realtime/session';
import { qk } from '@/lib/query-keys';
import { createEmoji, deleteEmoji, listEmojis } from './api';

const EMOJI_STALE_TIME = 5 * 60 * 1000;

function useEmojisQuery(serverId: string | undefined) {
  return useQuery<CustomEmojiListResponse>({
    queryKey: qk.emojis(serverId ?? ''),
    queryFn: () => listEmojis(serverId ?? ''),
    enabled: serverId !== undefined && serverId !== '',
    staleTime: EMOJI_STALE_TIME,
  });
}

export function useEmojis(serverId: string) {
  return useEmojisQuery(serverId);
}

export function prefetchEmojis(queryClient: QueryClient, serverId: string): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: qk.emojis(serverId),
    queryFn: () => listEmojis(serverId),
    staleTime: EMOJI_STALE_TIME,
  });
}

export function useCreateEmoji(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomEmojiInput) => createEmoji(serverId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.emojis(serverId) });
    },
  });
}

export function useDeleteEmoji(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emojiId: string) => deleteEmoji(emojiId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.emojis(serverId) });
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

export function useEmojiMap(serverId: string | undefined): Map<string, CustomEmojiDto> {
  const { data } = useEmojisQuery(serverId);
  return useMemo(() => new Map((data?.emojis ?? []).map((emoji) => [emoji.id, emoji])), [data]);
}

export function useEmojiEvents(session: RealtimeSession) {
  const queryClient = useQueryClient();
  const onExpressionsUpdated = useEffectEvent((event: ExpressionsUpdatedPayload) => {
    void queryClient.invalidateQueries({ queryKey: qk.emojis(event.serverId) });
    void queryClient.invalidateQueries({ queryKey: qk.stickers(event.serverId) });
  });
  useEffect(() => {
    session.socket.on(ServerEvents.ExpressionsUpdated, onExpressionsUpdated);
    return () => {
      session.socket.off(ServerEvents.ExpressionsUpdated, onExpressionsUpdated);
    };
  }, [session.socket, onExpressionsUpdated]);
}
