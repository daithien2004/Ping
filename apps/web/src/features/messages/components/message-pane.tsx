'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { useChannelRealtime } from '@/features/realtime/hooks';
import { TypingIndicator } from '@/features/realtime/components/typing-indicator';
import { useMe } from '@/features/auth/hooks';
import { useMarkRead, useUnread } from '@/features/unread/hooks';
import { messagePath } from '@/features/servers/navigation';
import { incomingMessage } from '../announce';
import { useLoadNewer, useMessages, useResetWindow, useSeedAround, useSendMessage } from '../hooks';
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
  focusId,
}: {
  serverId: string;
  channelId: string;
  channelName: string;
  /** Tin cần nhảy tới (permalink `…/messages/:id` hoặc `?m=` cũ), null nếu không có. */
  focusId: string | null;
}) {
  const roomDenied = useChannelRealtime(serverId, channelId);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(channelId);
  const sendMutation = useSendMessage(channelId);
  const seedAround = useSeedAround(channelId);
  const resetWindow = useResetWindow(channelId);
  const loadNewer = useLoadNewer(channelId);
  const router = useRouter();
  const { data: unread } = useUnread(serverId);
  // `mutate` của TanStack có identity ổn định — tách ra để effect dưới không chạy lại khi
  // trạng thái mutation đổi (tránh vòng mutate → isPending → effect → mutate).
  const { mutate: mutateRead } = useMarkRead(channelId);
  const [selection, setSelection] = useState<MessageSelection | null>(null);
  // TG.1: tin đang được trả lời (đích của khối trích dẫn trong composer).
  const [replyTo, setReplyTo] = useState<ClientMessage | null>(null);
  // TG.1: tin gốc vừa được bấm "nhảy tới" — tô sáng tạm thời.
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
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
      // Có `?m=` thì để effect nhảy tới tin gốc quyết định vị trí, không kéo xuống đáy trước.
      if (!focusId) {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
        // Đã ở đáy thì virtual-core tự giữ ở đáy khi chiều cao thật của tin được đo dần.
        requestAnimationFrame(() => setLoadOlderEnabled(true));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, virtualizer, focusId]);

  // TG.5: nhảy tới tin đích của permalink / `?m=`. Tin đã có trong trang đang tải → cuộn tới;
  // chưa có (tin cũ hơn) → nạp MỘT cửa sổ `?around=` (keyset, không quét lịch sử) rồi cuộn tới.
  const focusIndex = focusId ? messages.findIndex((message) => message.id === focusId) : -1;
  const windowed = focusId !== null && data?.window?.aroundId === focusId;
  const [focusMissing, setFocusMissing] = useState(false);
  const seeding = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || focusIndex >= 0 || windowed || seeding.current === focusId) return;
    seeding.current = focusId;
    void seedAround(focusId)
      .then((result) => {
        if (result === 'missing') setFocusMissing(true);
      })
      .catch(() => {
        // Lỗi mạng: để lần điều hướng sau thử lại, không treo UI.
      })
      .finally(() => {
        seeding.current = null;
      });
  }, [focusId, focusIndex, windowed, seedAround]);

  const focusPending = focusId !== null && focusIndex < 0 && !focusMissing;
  // Rời permalink (không còn tin đích) mà cache vẫn là cửa sổ → nạp lại trang mới nhất.
  useEffect(() => {
    if (focusId === null && data?.window) void resetWindow();
  }, [focusId, data?.window, resetWindow]);
  useEffect(() => {
    if (focusIndex < 0) return;
    virtualizer.scrollToIndex(focusIndex, { align: 'center' });
    // Đã tới đích thì trả lại hành vi tải tin cũ khi cuộn lên.
    setLoadOlderEnabled(true);
  }, [focusIndex, virtualizer]);

  // TG.5: cửa sổ permalink còn tin mới hơn ở dưới — tải tiếp từng trang cho tới tin mới nhất.
  const hasNewer = data?.window?.hasNewer ?? false;
  const [loadingNewer, setLoadingNewer] = useState(false);
  function loadMoreNewer() {
    if (loadingNewer) return;
    setLoadingNewer(true);
    void loadNewer().finally(() => setLoadingNewer(false));
  }

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

  // T4.3: vào kênh / có tin mới ở kênh đang xem → đánh dấu đã đọc tới tin cuối. Tin optimistic
  // (id `temp-…`) chưa tồn tại ở server nên bỏ qua; cursor chỉ tiến nên gửi lặp vẫn vô hại.
  // TG.5: cửa sổ permalink chưa phải tin mới nhất — không mark-read (sẽ xóa oan badge chưa đọc);
  // chỉ đánh dấu khi đã tải tới đáy thật (hasNewer = false).
  useEffect(() => {
    if (hasNewer) return;
    const last = messages.at(-1);
    if (last && !last.id.startsWith('temp-')) {
      mutateRead(last.id);
    }
  }, [messages, mutateRead, hasNewer]);

  // T4.3: vạch "Tin mới" — cursor ĐÃ ĐỌC được chốt MỘT lần mỗi phiên xem kênh: mark-read
  // của chính mình (đi kèm `read.updated`) không kéo vạch chạy xuống. `<Activity>` giữ
  // component khi rời kênh nhưng tháo effect khi ẩn nên vào lại = phiên mới (reset),
  // kể cả khi trang bị unmount hoàn toàn.
  const dividerCursor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    dividerCursor.current = undefined;
  }, [channelId]);
  useEffect(() => {
    if (dividerCursor.current === undefined && unread !== undefined) {
      dividerCursor.current =
        unread.find((row) => row.channelId === channelId)?.lastReadMessageId ?? null;
    }
  }, [unread, channelId]);
  const dividerId =
    dividerCursor.current != null
      ? (messages.find((message) => message.id > dividerCursor.current!)?.id ?? null)
      : null;

  function send(content: string, nonce: string, replyToId?: string) {
    if (!ready || !ability.can('create', 'Message')) return;
    sendMutation.mutate({ content, nonce, ...(replyToId ? { replyToId } : {}) });
  }

  // Tin của chính mình: luôn xuống đáy để thấy nó, kể cả khi đang đọc tin cũ. KHÔNG cuộn ngay:
  // tin optimistic chỉ vào cache sau `await cancelQueries()` trong onMutate, cuộn sớm thì dừng ở
  // tin cuối CŨ (e2e bắt được: lệch đúng một tin, chập chờn). Đánh dấu, cuộn khi danh sách dài ra.
  const scrollOnAppend = useRef(false);
  function sendOwn(content: string, nonce: string, replyToId?: string) {
    scrollOnAppend.current = true;
    send(content, nonce, replyToId);
    setReplyTo(null);
  }
  useEffect(() => {
    if (!scrollOnAppend.current) {
      return;
    }
    scrollOnAppend.current = false;
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
  }, [messages.length, virtualizer]);

  const retry = (message: ClientMessage) => {
    if (message.nonce) send(message.content, message.nonce, message.replyTo?.id);
  };

  // Nhảy tới tin gốc của một reply. Tin đã có trong cửa sổ → cuộn + tô sáng; tin cũ hơn
  // (chưa tải) → mở permalink để pane nạp `?around=` quanh nó (TG.5, ADR-0061).
  function jumpTo(messageId: string) {
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) {
      router.push(messagePath(serverId, channelId, messageId));
      return;
    }
    virtualizer.scrollToIndex(index, { align: 'center' });
    setJumpTarget(messageId);
  }
  useEffect(() => {
    if (!jumpTarget) return;
    const timer = setTimeout(() => setJumpTarget(null), 2000);
    return () => clearTimeout(timer);
  }, [jumpTarget]);

  // A background query error retains old data; hide it immediately on denied room ACK.
  if (roomDenied)
    return (
      <p role="alert" className="m-auto text-sm text-muted-foreground">
        {errors('FORBIDDEN')}
      </p>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {focusMissing && (
        <p
          role="alert"
          data-testid="focus-missing"
          className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {t('focusMissing')}
        </p>
      )}
      {focusPending && !focusMissing && (
        <p
          role="status"
          data-testid="focus-loading"
          className="border-b px-4 py-2 text-sm text-muted-foreground"
        >
          {t('focusLoading')}
        </p>
      )}
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
                {/* T4.3: vạch "Tin mới" nằm ngay trên tin chưa đọc đầu tiên (nếu trong
                    cửa sổ đã tải — nhảy sâu tới tin cũ hơn thuộc TG.5 `?around=`). */}
                {message.id === dividerId && (
                  <p
                    aria-label={t('newDivider')}
                    className="mx-4 mb-1 flex items-center gap-2 text-xs font-medium text-destructive"
                  >
                    <span className="h-px flex-1 bg-destructive/40" aria-hidden />
                    {t('newDivider')}
                    <span className="h-px flex-1 bg-destructive/40" aria-hidden />
                  </p>
                )}
                <MessageItem
                  message={message}
                  permalink={messagePath(serverId, channelId, message.id)}
                  onRetry={retry}
                  onAction={setSelection}
                  onReply={setReplyTo}
                  onJumpTo={jumpTo}
                  highlighted={message.id === focusId || message.id === jumpTarget}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* TG.5: cửa sổ permalink dừng ở tin đích — không tự nối tới hiện tại (channel 10k tin).
          Người dùng chủ động tải thêm từng trang mới hơn khi muốn đọc tiếp. */}
      {hasNewer && (
        <div className="flex justify-center border-t px-4 py-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="load-newer"
            onClick={loadMoreNewer}
            disabled={loadingNewer}
          >
            {loadingNewer ? t('loadingNewer') : t('loadNewer')}
          </Button>
        </div>
      )}

      <TypingIndicator channelId={channelId} />
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <MessageComposer
        channelId={channelId}
        channelName={channelName}
        replyTo={
          replyTo
            ? {
                id: replyTo.id,
                authorName: replyTo.author.displayName,
                content: replyTo.content.slice(0, 120),
                deleted: false,
              }
            : null
        }
        onCancelReply={() => setReplyTo(null)}
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
