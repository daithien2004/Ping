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
import { onServerEvent } from '@/features/realtime/socket';
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

const PROCESSED_CAP = 500;

interface NotifyLabels {
  bodyFallback: string;
  stickerLabel: string;
  gifLabel: string;
  attachmentLabel: string;
  fallbackTitle: string;
}

async function fetchMessage(channelId: string, messageId: string): Promise<MessageDto | null> {
  try {
    const page = await listMessagesAround(channelId, messageId, 1);
    return page.messages.find((message) => message.id === messageId) ?? null;
  } catch {
    return null;
  }
}

export function useNotificationEvents(session: RealtimeSession, userId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
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
      if (event.authorId === userId) return;
      if (document.hidden !== true) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      const prefs =
        queryClient.getQueryData<NotificationPrefsResponse>(qk.notificationPrefs)?.prefs ?? [];
      const level = effectiveLevel(prefs, event.serverId, event.channelId);
      // channel.activity không mang cờ mention: mức 'mentions' chờ mention.created, không đoán từ nội dung.
      if (!gotMentionEvent && level === 'mentions') return;
      const mutedUntil = effectiveMutedUntil(prefs, event.serverId, event.channelId);

      const message = await fetchMessage(event.channelId, event.messageId);
      if (message && message.authorId === userId) return;
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

    const off = [
      onServerEvent(session.socket, ServerEvents.ChannelActivity, activity),
      onServerEvent(session.socket, ServerEvents.MentionCreated, mention),
    ];
    return () => off.forEach((stop) => stop());
  }, [session, userId, queryClient, router, t]);
}

interface FireDeps {
  queryClient: ReturnType<typeof useQueryClient>;
  router: ReturnType<typeof useRouter>;
  labels: NotifyLabels;
}

function fireNotification(
  event: ChannelActivityPayload,
  message: MessageDto | null,
  deps: FireDeps,
): void {
  const title = titleOf(event, deps.queryClient, deps.labels.fallbackTitle);
  const body = bodyOf(message, deps.labels);
  try {
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
    // Notification không dùng được (thiếu secure context): bỏ qua.
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
