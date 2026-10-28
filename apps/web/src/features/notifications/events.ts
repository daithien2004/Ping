'use client';

import {
  ServerEvents,
  shouldNotify,
  type ChannelActivityPayload,
  type ChannelDto,
  type MentionCreatedPayload,
  type MessageDto,
  type NotificationPrefsResponse,
  type ServerSummary,
} from '@ping/shared';
import type { DmListResponse } from '@ping/shared';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { useEffect } from 'react';
import type { RealtimeSession } from '@/features/realtime/session';
import { dmMessagePath } from '@/features/dms/navigation';
import { listMessagesAround } from '@/features/messages/api';
import { messagePath } from '@/features/servers/navigation';
import { qk } from '@/lib/query-keys';
import { useNotificationPrefs } from './hooks';
import {
  effectiveLevel,
  effectiveMutedUntil,
  hasEveryoneToken,
  mentionFlags,
} from './notification-cache';
import { readIgnoreEveryone, readSoundEnabled } from './notify-storage';
import { playNotifyBeep } from './sound';

/** Trần số messageId nhớ trong phiên — chống bắn hai lần cho cùng một tin (activity + mention). */
const PROCESSED_CAP = 500;

/** Nhãn i18n cần khi dựng body/title — tách object để helper không phụ thuộc hook. */
interface NotifyLabels {
  bodyFallback: string;
  stickerLabel: string;
  gifLabel: string;
  attachmentLabel: string;
  fallbackTitle: string;
}

/** Lấy nội dung tin để dựng body/isEveryone: API không có GET một tin, dùng cửa sổ `around` limit 1. */
async function fetchMessage(channelId: string, messageId: string): Promise<MessageDto | null> {
  try {
    const page = await listMessagesAround(channelId, messageId, 1);
    return page.messages.find((message) => message.id === messageId) ?? null;
  } catch {
    // Tin vừa xóa / mất mạng: vẫn báo với nội dung chung chung thay vì bỏ sót một ping thật.
    return null;
  }
}

/**
 * Sự kiện realtime → thông báo trình duyệt (TG.12). Hai nguồn, cùng nguồn sự thật với badge
 * hiện có (features/unread):
 * - `channel.activity` (room server; DM đi room user với `serverId: null`): MỌI tin mới,
 *   KHÔNG mang nội dung hay cờ mention — chỉ đủ để quyết mức 'all'.
 * - `mention.created` (room user, CHỈ tới người được nhắc, đã kiểm quyền phía server): nguồn
 *   sự thật của "mình bị nhắc" — mức 'mentions' chỉ quyết theo event này.
 *
 * Tiêu chí nghiệm thu: KHÔNG BAO GIỜ báo khi tab đang focus (`document.hidden === true` mới
 * bắn) và quyền Notification phải granted (xin quyền là thao tác người dùng — nút ở rail).
 * DM: mọi tin là mention-style (ADR-0070 mục 7) nên coi như có event mention.
 */
export function useNotificationEvents(session: RealtimeSession, userId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  // Nạp prefs một lần khi boot (staleTime 30s) để lúc có tin không phải chờ fetch.
  useNotificationPrefs();
  const t = useTranslations('notifications');

  useEffect(() => {
    const processed = new Set<string>();
    const labels: NotifyLabels = {
      bodyFallback: t('bodyFallback'),
      stickerLabel: t('stickerLabel'),
      gifLabel: t('gifLabel'),
      attachmentLabel: t('attachmentLabel'),
      fallbackTitle: t('fallbackTitle'),
    };

    const handle = async (event: ChannelActivityPayload, gotMentionEvent: boolean) => {
      if (processed.has(event.messageId)) return;
      if (event.authorId === userId) return; // tin của chính mình (tab khác gửi) — không tự báo
      // Tiêu chí TG.12: chỉ bắn khi tab KHÔNG hiển thị; đang focus thì badge/title tự lo.
      if (document.hidden !== true) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      const prefs =
        queryClient.getQueryData<NotificationPrefsResponse>(qk.notificationPrefs)?.prefs ?? [];
      const level = effectiveLevel(prefs, event.serverId, event.channelId);
      // channel.activity không mang cờ mention: mức 'mentions' phải chờ mention.created
      // (đi sau, phát riêng cho người được nhắc) — không đoán từ nội dung để khỏi lệch quyền ping.
      if (!gotMentionEvent && level === 'mentions') return;
      const mutedUntil = effectiveMutedUntil(prefs, event.serverId, event.channelId);

      const message = await fetchMessage(event.channelId, event.messageId);
      if (message && message.authorId === userId) return; // tự nhắc chính mình trong tin của mình
      const ignoreEveryone = readIgnoreEveryone();
      const flags = mentionFlags(
        gotMentionEvent,
        message ? hasEveryoneToken(message.content) : false,
        ignoreEveryone,
      );
      if (
        !shouldNotify({
          level,
          mutedUntil,
          isMention: flags.isMention,
          isEveryone: flags.isEveryone,
          ignoreEveryone,
        })
      ) {
        return;
      }
      processed.add(event.messageId);
      if (processed.size >= PROCESSED_CAP) processed.clear();

      fireNotification(event, message, { queryClient, router, labels });
      if (readSoundEnabled()) playNotifyBeep();
    };

    const activity = (event: ChannelActivityPayload) => {
      void handle(event, false);
    };
    const mention = (event: MentionCreatedPayload) => {
      // mention.created không mang authorId — chỉ biết chắc sau khi fetch tin (handle kiểm lại).
      void handle(
        {
          channelId: event.channelId,
          serverId: event.serverId,
          messageId: event.messageId,
          authorId: '',
        },
        true,
      );
    };

    session.socket.on(ServerEvents.ChannelActivity, activity);
    session.socket.on(ServerEvents.MentionCreated, mention);
    return () => {
      session.socket.off(ServerEvents.ChannelActivity, activity);
      session.socket.off(ServerEvents.MentionCreated, mention);
    };
  }, [session, userId, queryClient, router, t]);
}

interface FireDeps {
  queryClient: ReturnType<typeof useQueryClient>;
  router: ReturnType<typeof useRouter>;
  labels: NotifyLabels;
}

/** Dựng title `#kênh · server` (DM: tên đối tác) + body "tác giả: trích dẫn" rồi bắn Notification. */
function fireNotification(
  event: ChannelActivityPayload,
  message: MessageDto | null,
  deps: FireDeps,
): void {
  const title = titleOf(event, deps.queryClient, deps.labels.fallbackTitle);
  const body = bodyOf(message, deps.labels);
  try {
    // `tag` theo channel: tin mới của cùng kênh GOM vào một thông báo thay vì chồng chất.
    const notification = new Notification(title, {
      tag: event.channelId,
      body,
      icon: '/favicon.ico',
    });
    notification.onclick = () => {
      window.focus();
      deps.router.push(permalinkOf(event));
    };
  } catch {
    // Ngữ cảnh không hỗ trợ Notification (thiếu secure context…) — bỏ qua, badge vẫn chạy.
  }
}

function titleOf(
  event: ChannelActivityPayload,
  queryClient: FireDeps['queryClient'],
  fallbackTitle: string,
): string {
  if (event.serverId === null) {
    const dm = queryClient
      .getQueryData<DmListResponse>(qk.dms)
      ?.dms.find((row) => row.channelId === event.channelId);
    return dm?.partner.displayName ?? fallbackTitle;
  }
  const serverName = queryClient
    .getQueryData<ServerSummary[]>(qk.servers)
    ?.find((server) => server.id === event.serverId)?.name;
  const channelName = queryClient
    .getQueryData<ChannelDto[]>(qk.channels(event.serverId))
    ?.find((channel) => channel.id === event.channelId)?.name;
  const parts = [channelName ? `#${channelName}` : null, serverName ?? null].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(' · ') : fallbackTitle;
}

function bodyOf(message: MessageDto | null, labels: NotifyLabels): string {
  if (!message) return labels.bodyFallback;
  const name = message.author.displayName;
  const excerpt =
    message.content.length > 80 ? `${message.content.slice(0, 80)}…` : message.content;
  if (message.kind === 'sticker') return `${name}: ${labels.stickerLabel}`;
  if (message.kind === 'gif') return `${name}: ${labels.gifLabel}`;
  if (!excerpt) {
    return (message.attachments?.length ?? 0) > 0
      ? `${name}: ${labels.attachmentLabel}`
      : `${name}: ${labels.bodyFallback}`;
  }
  return `${name}: ${excerpt}`;
}

function permalinkOf(event: ChannelActivityPayload): string {
  return event.serverId === null
    ? dmMessagePath(event.channelId, event.messageId)
    : messagePath(event.serverId, event.channelId, event.messageId);
}
