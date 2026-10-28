'use client';

import type {
  ChannelActivityPayload,
  ChannelUnreadDto,
  MentionCreatedPayload,
  ReadUpdatedPayload,
} from '@ping/shared';
import { ServerEvents } from '@ping/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { qk } from '@/lib/query-keys';
import type { RealtimeSession } from '@/features/realtime/session';
import { listUnread, markChannelRead } from './api';
import { applyIncoming, applyRead } from './unread-cache';

/**
 * Unread của một server (T4.3). Không suspense: rail cần render ngay cả khi chưa có số.
 * Cache được các event realtime cập nhật tinh (xem useUnreadEvents) và fetch lại khi
 * socket reconnect (đối soát tin đến lúc mất mạng).
 * TG.9: `null` = xem DM (không thuộc server nào) — không gọi API, unread DM do `qk.dms` lo.
 */
export function useUnread(serverId: string | null) {
  return useQuery({
    queryKey: qk.unread(serverId ?? ''),
    queryFn: () => listUnread(serverId ?? ''),
    enabled: serverId !== null,
  });
}

/**
 * Đánh dấu đã đọc đến một tin (T4.2). `read.updated` server phát sẽ tới các tab khác.
 */
export function useMarkRead(channelId: string) {
  return useMutation({
    mutationFn: (messageId: string) => markChannelRead(channelId, messageId),
  });
}

/**
 * Gắn sự kiện realtime cho unread (T4.3): tin mới / mình được mention / mình vừa đọc ở
 * tab khác. Channel ĐANG XEM do nơi gọi lọc (đánh dấu đã đọc riêng) — hook chỉ nhận
 * activeChannelId hiện tại để so sánh.
 */
export function useUnreadEvents(
  session: RealtimeSession,
  userId: string,
  activeChannelId?: string,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const serverIdOfChannel = (channelId: string): string | null => {
      // Đổi cache unread channel thuộc server nào: quét key ['servers', id, 'unread'] đang có.
      for (const query of queryClient.getQueryCache().getAll()) {
        if (query.queryKey[0] === 'servers' && query.queryKey[2] === 'unread') {
          const rows = query.state.data as ChannelUnreadDto[] | undefined;
          if (rows?.some((row) => row.channelId === channelId)) {
            return query.queryKey[1] as string;
          }
        }
      }
      return null;
    };

    const bump = (
      channelId: string,
      options: { isOwn: boolean; mention: boolean; countsUnread?: boolean },
    ) => {
      const serverId = serverIdOfChannel(channelId);
      if (!serverId) return; // server chưa nạp unread (đang không ở rail?) — lần fetch sau tự đúng
      queryClient.setQueryData<ChannelUnreadDto[]>(qk.unread(serverId), (old) =>
        old ? applyIncoming(old, channelId, options) : old,
      );
    };

    const message = (event: ChannelActivityPayload) => {
      if (event.channelId === activeChannelId) return; // đang xem: mark-read lo phần đó
      bump(event.channelId, { isOwn: event.authorId === userId, mention: false });
    };
    const mention = (event: MentionCreatedPayload) => {
      if (event.channelId === activeChannelId) return;
      // mention.created KHÔNG tăng unread lần hai: channel.activity của cùng tin đã đếm
      // (TG.12 — tổng unread lên title/favicon, đếm đôi sẽ lộ thẳng lên badge).
      bump(event.channelId, { isOwn: false, mention: true, countsUnread: false });
    };
    const read = (event: ReadUpdatedPayload) => {
      const serverId = serverIdOfChannel(event.channelId);
      if (!serverId) return;
      queryClient.setQueryData<ChannelUnreadDto[]>(qk.unread(serverId), (old) =>
        old ? applyRead(old, event.channelId, event.lastReadMessageId) : old,
      );
    };
    // Reconnect: tin đến lúc mất kết nối không có event — fetch lại unread mọi server.
    const connected = () => {
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'servers' && query.queryKey[2] === 'unread',
      });
    };

    session.socket.on(ServerEvents.ChannelActivity, message);
    session.socket.on(ServerEvents.MentionCreated, mention);
    session.socket.on(ServerEvents.ReadUpdated, read);
    session.socket.on('connect', connected);
    return () => {
      session.socket.off(ServerEvents.ChannelActivity, message);
      session.socket.off(ServerEvents.MentionCreated, mention);
      session.socket.off(ServerEvents.ReadUpdated, read);
      session.socket.off('connect', connected);
    };
  }, [session, userId, activeChannelId, queryClient]);
}
