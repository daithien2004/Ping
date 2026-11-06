'use client';

import type {
  ChannelActivityPayload,
  MentionCreatedPayload,
  ReadUpdatedPayload,
  ServerUnreadDto,
} from '@ping/shared';
import { ServerEvents } from '@ping/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { qk } from '@/lib/query-keys';
import type { RealtimeSession } from '@/features/realtime/session';
import { listAllUnread, markChannelRead } from './api';
import { applyIncomingAll, applyReadAll } from './unread-cache';

/**
 * Unread của một server (T4.3, ADR-0077). Không suspense: rail cần render ngay cả khi chưa
 * có số. Mọi lời gọi dùng CHUNG một query gộp (`qk.unreadAll`) rồi `select` phần của server
 * mình — rail 69 server vẫn chỉ bắn một request thay vì 69. Cache được event realtime cập
 * nhật tinh (xem useUnreadEvents) và fetch lại một lần khi socket reconnect.
 * TG.9: `null` = xem DM (không thuộc server nào) — không có phần server để chọn, unread DM
 * do `qk.dms` lo.
 */
export function useUnread(serverId: string | null) {
  return useQuery({
    queryKey: qk.unreadAll,
    queryFn: listAllUnread,
    select: (servers: ServerUnreadDto[]) =>
      serverId === null
        ? undefined
        : servers.find((server) => server.serverId === serverId)?.channels,
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
    // ADR-0077: cache là một mảng server; helper tự tìm server chứa channel, không tìm thấy
    // (channel ngoài cache gộp) thì giữ nguyên — lần fetch sau tự đúng.
    const bump = (
      channelId: string,
      options: { isOwn: boolean; mention: boolean; countsUnread?: boolean },
    ) => {
      queryClient.setQueryData<ServerUnreadDto[]>(qk.unreadAll, (old) =>
        old ? applyIncomingAll(old, channelId, options) : old,
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
      queryClient.setQueryData<ServerUnreadDto[]>(qk.unreadAll, (old) =>
        old ? applyReadAll(old, event.channelId, event.lastReadMessageId) : old,
      );
    };
    // Reconnect: tin đến lúc mất kết nối không có event — MỘT lần fetch unread gộp
    // (ADR-0077), thay cho việc invalidate N key per-server như trước.
    const connected = () => {
      void queryClient.invalidateQueries({ queryKey: qk.unreadAll });
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
