'use client';
import {
  ServerEvents,
  type CreateCustomEmojiInput,
  type CustomEmojiDto,
  type CustomEmojiListResponse,
  type ExpressionsUpdatedPayload,
} from '@ping/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useMemo } from 'react';
import type { RealtimeSession } from '@/features/realtime/session';
import { qk } from '@/lib/query-keys';
import { createEmoji, deleteEmoji, listEmojis } from './api';

/** Danh sách emoji đổi hiếm (trần 50+50); staleTime 5 phút đủ cho picker mở/đóng liên tục. */
const EMOJI_STALE_TIME = 5 * 60 * 1000;

/**
 * Emoji tùy chỉnh của một server (TG.24, ADR-0068). Picker, gợi ý soạn tin, render tin/reaction
 * và màn quản trị dùng chung một query; tạo/xóa invalidate đúng server đó.
 */
function useEmojisQuery(serverId: string | undefined) {
  return useQuery<CustomEmojiListResponse>({
    queryKey: qk.emojis(serverId ?? ''),
    queryFn: () => listEmojis(serverId ?? ''),
    // serverId chưa biết (tin chưa gắn server, picker không có tab server) → không gọi API.
    enabled: serverId !== undefined && serverId !== '',
    staleTime: EMOJI_STALE_TIME,
  });
}

export function useEmojis(serverId: string) {
  return useEmojisQuery(serverId);
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
      // Tin cũ chứa emoji vừa xóa chỉ hiện placeholder `:ten:` sau khi DTO mới về — invalidate
      // toàn bộ cache tin nhắn (hành động hiếm, chấp nhận được; pattern của useDeleteSticker).
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
}

/**
 * Map id → emoji của server để render token `:ten:<id>` trong tin/reaction (TG.4). Cùng query
 * với {@link useEmojis} nên picker và renderer chia sẻ cache; serverId thiếu → map rỗng.
 */
export function useEmojiMap(serverId: string | undefined): Map<string, CustomEmojiDto> {
  const { data } = useEmojisQuery(serverId);
  return useMemo(() => new Map((data?.emojis ?? []).map((emoji) => [emoji.id, emoji])), [data]);
}

/**
 * `expressions.updated` (TG.24): emoji hoặc sticker của server vừa tạo/xóa ở tab khác —
 * invalidate cả hai danh sách biểu cảm để hai tab tự đồng bộ (ADR-0068, một event chung).
 */
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
