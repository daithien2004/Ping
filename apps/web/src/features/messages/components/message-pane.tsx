'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { useChannelRealtime } from '@/features/realtime/hooks';
import { TypingIndicator } from '@/features/realtime/components/typing-indicator';
import { useMe } from '@/features/auth/hooks';
import { incomingMessage } from '../announce';
import { useMessages, useSendMessage } from '../hooks';
import { type ClientMessage, oldestFirst } from '../message-cache';
import { MessageComposer } from './message-composer';
import { MessageItem } from './message-item';
import type { MessageSelection } from './message-actions';
import { MessageDialogs } from './message-dialogs';
import { useServerAbility } from '@/features/permissions/context';

/** Chiều cao phần đầu danh sách ("Đây là đầu channel" / "Đang tải tin cũ…"). */
const HEADER_HEIGHT = 48;

/**
 * Danh sách tin (ảo hóa) + ô soạn tin của một channel.
 *
 * Ba hành vi cuộn, đều nhờ option sẵn có của @tanstack/virtual-core 3.19:
 * - `anchorTo: 'end'`: chèn trang tin cũ lên trên thì tin đang xem đứng yên (neo theo key).
 * - `followOnAppend`: có tin mới ở cuối thì tự cuộn theo, CHỈ khi đang đứng ở đáy.
 * - Vào channel lần đầu thì cuộn xuống đáy (một lần; <Activity> giữ vị trí khi quay lại).
 */
export function MessagePane({
  serverId,
  channelId,
  channelName,
}: {
  serverId: string;
  channelId: string;
  channelName: string;
}) {
  const roomDenied = useChannelRealtime(serverId, channelId);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(channelId);
  const sendMutation = useSendMessage(channelId);
  const [selection, setSelection] = useState<MessageSelection | null>(null);
  const { ability, ready } = useServerAbility();
  const messages = useMemo(() => oldestFirst(data), [data]);
  const t = useTranslations('messages');
  const { data: me } = useMe();
  // Vùng aria-live: đọc tin mới của người khác (xem announce.ts). Tính ngay trong lúc render theo mẫu
  // "state dẫn xuất" của React: so tin cuối với lần render trước, không cần effect.
  const tail = messages.at(-1);
  const [seenTailId, setSeenTailId] = useState<string | null>(tail?.id ?? null);
  const [announcement, setAnnouncement] = useState('');
  if ((tail?.id ?? null) !== seenTailId) {
    setSeenTailId(tail?.id ?? null);
    const incoming = incomingMessage(seenTailId, tail, me?.id);
    if (incoming) setAnnouncement(t('newMessage', incoming));
  }
  const errors = useTranslations('errors');
  const scrollRef = useRef<HTMLDivElement>(null);
  // Ô soạn: empty state bấm "Gửi tin đầu tiên" để đưa con trỏ về ô nhập (TF.9).
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const canSend = ability.can('create', 'Message');
  const didInitialScroll = useRef(false);
  // Chỉ tải tin cũ SAU khi đã xuống đáy lần đầu: ở lần render đầu danh sách còn đứng ở đầu,
  // tin index 0 "đang hiện" → nếu không chặn sẽ tải ngay trang cũ, neo kéo vị trí lên giữa.
  const [loadOlderEnabled, setLoadOlderEnabled] = useState(false);

  // useVirtualizer trả về hàm đổi theo state nội bộ nên React Compiler không memo được component
  // này (giới hạn đã biết của thư viện): component chỉ không được tự tối ưu, vẫn chạy đúng.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
    paddingStart: HEADER_HEIGHT,
    // Key theo nonce trước: tin tạm `temp-<nonce>` và tin thật cùng nonce là CÙNG một hàng,
    // nên xác nhận tin không làm danh sách tưởng có hàng mới (không nhảy, không mất neo).
    getItemKey: (index) => messages[index]?.nonce ?? messages[index]?.id ?? index,
    anchorTo: 'end',
    followOnAppend: true,
  });

  // Vào channel: xuống tin mới nhất — một lần. Cuộn trong requestAnimationFrame và HỦY ở cleanup:
  // StrictMode (dev) chạy effect hai lần và tạm tách virtualizer khỏi phần tử cuộn ở giữa, nên
  // đánh dấu "đã cuộn" ngay lần đầu thì lần cuộn thật bị hủy mất (đã gặp khi kiểm tra). Khi
  // <Activity> hiện lại route, ref vẫn true nên vị trí cuộn cũ được giữ.
  useEffect(() => {
    if (didInitialScroll.current || messages.length === 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      didInitialScroll.current = true;
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
      // Đã ở đáy thì virtual-core tự giữ ở đáy khi chiều cao thật của tin được đo dần.
      requestAnimationFrame(() => setLoadOlderEnabled(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, virtualizer]);

  // Cuộn gần tới đầu danh sách → tải trang cũ hơn.
  const firstVisible = virtualizer.getVirtualItems()[0]?.index;
  useEffect(() => {
    if (
      loadOlderEnabled &&
      firstVisible !== undefined &&
      firstVisible <= 2 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      void fetchNextPage();
    }
  }, [loadOlderEnabled, firstVisible, hasNextPage, isFetchingNextPage, fetchNextPage]);

  function send(content: string, nonce: string) {
    if (!ready || !ability.can('create', 'Message')) return;
    sendMutation.mutate({ content, nonce });
  }

  // Tin của chính mình: luôn xuống đáy để thấy nó, kể cả khi đang đọc tin cũ. KHÔNG cuộn ngay:
  // tin optimistic chỉ vào cache sau `await cancelQueries()` trong onMutate, cuộn sớm thì dừng ở
  // tin cuối CŨ (e2e bắt được: lệch đúng một tin, chập chờn). Đánh dấu, cuộn khi danh sách dài ra.
  const scrollOnAppend = useRef(false);
  function sendOwn(content: string, nonce: string) {
    scrollOnAppend.current = true;
    send(content, nonce);
  }
  useEffect(() => {
    if (!scrollOnAppend.current) {
      return;
    }
    scrollOnAppend.current = false;
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
  }, [messages.length, virtualizer]);

  const retry = (message: ClientMessage) => {
    if (message.nonce) send(message.content, message.nonce);
  };

  // A background query error retains old data; hide it immediately on denied room ACK.
  if (roomDenied)
    return (
      <p role="alert" className="m-auto text-sm text-muted-foreground">
        {errors('FORBIDDEN')}
      </p>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        aria-label={t('listLabel', { channel: channelName })}
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          <p
            className="absolute inset-x-0 top-0 flex items-end px-4 pb-2 text-sm text-muted-foreground"
            style={{ height: HEADER_HEIGHT }}
          >
            {isFetchingNextPage
              ? t('loadingOlder')
              : hasNextPage
                ? ''
                : t('channelStart', { channel: channelName })}
          </p>
          {messages.length === 0 && !hasNextPage && (
            <div
              className="absolute inset-x-0 flex flex-col items-center gap-3 px-4 pt-10 text-center"
              style={{ top: HEADER_HEIGHT }}
            >
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
              {canSend && (
                <Button size="sm" variant="outline" onClick={() => composerRef.current?.focus()}>
                  {t('emptyAction')}
                </Button>
              )}
            </div>
          )}
          {virtualizer.getVirtualItems().map((item) => {
            const message = messages[item.index];
            if (!message) return null;
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <MessageItem message={message} onRetry={retry} onAction={setSelection} />
              </div>
            );
          })}
        </div>
      </div>

      <TypingIndicator channelId={channelId} />
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <MessageComposer
        channelId={channelId}
        channelName={channelName}
        onSend={sendOwn}
        textareaRef={composerRef}
      />
      <MessageDialogs
        selection={selection}
        message={messages.find((message) => message.id === selection?.messageId)}
        channelId={channelId}
        onClose={() => setSelection((current) => (current === selection ? null : current))}
      />
    </div>
  );
}
