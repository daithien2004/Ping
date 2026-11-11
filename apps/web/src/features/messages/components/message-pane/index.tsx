'use client';

import type { PingTextAreaRef } from '@/components/ui/ping-textarea';
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useChannelRealtime } from '@/features/realtime/hooks';
import { TypingIndicator } from '@/features/realtime/components/typing-indicator';
import { useMe } from '@/features/auth/hooks';
import { serverIdOf, type ChannelScope } from '../../channel-scope';
import { useMessages } from '../../hooks';
import { type ClientMessage, oldestFirst, replyPreviewOf } from '../../message-cache';
import { groupMessages } from '../../grouping';
import { MessageComposer } from '../message-composer';
import { MessageItem } from '../message-item';
import type { MessageSelection } from '../message-actions';
import { MessageDialogs } from '../message-dialogs';
import {
  EmptyState,
  FocusBanner,
  ListHeader,
  LoadNewerBar,
  NewDivider,
  RoomDenied,
} from './message-list-parts';
import { useJumpToMessage } from './use-jump-to-message';
import { useMarkReadTail } from './use-mark-read-tail';
import { useMessageScroll } from './use-message-scroll';
import { useMessageSending } from './use-message-sending';
import { useNewMessageAnnouncement } from './use-new-message-announcement';
import { usePermalinkWindow } from './use-permalink-window';
import { useUnreadDivider } from './use-unread-divider';

export function MessagePane({
  scope,
  channelId,
  channelName,
  focusId,
}: {
  scope: ChannelScope;
  channelId: string;
  channelName: string;
  focusId: string | null;
}) {
  const isDm = scope.kind === 'dm';
  const serverId = serverIdOf(scope);
  const roomDenied = useChannelRealtime(serverId, channelId);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(channelId);
  const messages = useMemo(() => oldestFirst(data), [data]);
  const rows = useMemo(() => groupMessages(messages), [messages]);

  const t = useTranslations('messages');
  const { data: me } = useMe();
  const [selection, setSelection] = useState<MessageSelection | null>(null);
  const [replyTo, setReplyTo] = useState<ClientMessage | null>(null);
  const composerRef = useRef<PingTextAreaRef>(null);

  const announcement = useNewMessageAnnouncement(messages, me?.id);

  const { focusIndex, focusMissing, focusPending, hasNewer, loadingNewer, loadMoreNewer } =
    usePermalinkWindow({ channelId, focusId, messages, window: data?.window });

  const { scrollRef, virtualizer, scrollToEndOnNextAppend } = useMessageScroll({
    messages,
    focusId,
    focusIndex,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  const { sendOwn, retry } = useMessageSending({
    channelId,
    onSendError: scope.kind === 'dm' ? scope.onSendError : undefined,
    onSubmit: () => setReplyTo(null),
    onWillAppend: scrollToEndOnNextAppend,
  });

  useMarkReadTail({ channelId, tailId: messages.at(-1)?.id ?? null, hasNewer });
  const dividerId = useUnreadDivider({ scope, channelId, messages });

  const { jumpTo, jumpTarget } = useJumpToMessage({
    messages,
    virtualizer,
    messagePath: scope.messagePath,
  });
  // Gom callback dùng bởi từng tin thành một object; memo hóa để giữ object ổn định giữa các lần render.
  const itemHandlers = useMemo(
    () => ({ onRetry: retry, onAction: setSelection, onReply: setReplyTo, onJumpTo: jumpTo }),
    [retry, jumpTo],
  );

  if (roomDenied) return <RoomDenied />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FocusBanner missing={focusMissing} pending={focusPending} />
      {/* Ref này nối vùng cuộn với virtualizer.getScrollElement để virtualizer biết cần cuộn phần tử nào. */}
      <div
        ref={scrollRef}
        data-testid="message-scroll"
        data-slot="message-pane"
        className="min-h-0 flex-1 overflow-y-auto"
        aria-label={
          isDm ? t('dmListLabel', { name: channelName }) : t('listLabel', { channel: channelName })
        }
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          <ListHeader
            loadingOlder={isFetchingNextPage}
            hasOlder={hasNextPage}
            isDm={isDm}
            channelName={channelName}
          />
          {messages.length === 0 && !hasNextPage && (
            <EmptyState onCompose={() => composerRef.current?.focus()} />
          )}
          {/* Chỉ dựng các tin đang gần vùng nhìn thấy, đặt chúng đúng vị trí và truyền trạng thái xuống MessageItem. */}
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const { message } = row;
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {message.id === dividerId && <NewDivider />}
                <MessageItem
                  message={message}
                  channelId={channelId}
                  serverId={serverId ?? undefined}
                  permalink={scope.messagePath(message.id)}
                  handlers={itemHandlers}
                  highlighted={message.id === focusId || message.id === jumpTarget}
                  grouped={row.grouped}
                  showDate={row.showDate}
                  mine={message.author.id === me?.id}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Chỉ hiện nút khi cửa sổ lịch sử còn tin mới hơn; bấm sẽ tải chúng và loadingNewer khóa nút lúc chờ. */}
      {hasNewer && <LoadNewerBar loading={loadingNewer} onLoad={loadMoreNewer} />}

      {/* Hiện số người đang gõ trong channel này; không có ai gõ thì vùng trạng thái để trống. */}
      <TypingIndicator channelId={channelId} />
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="message-announcer"
      >
        {announcement}
      </div>
      {/* Ô soạn tin cho channel này: nhận reply hiện tại, gửi qua sendOwn và cho phép focus textarea. */}
      <MessageComposer
        scope={scope}
        channelId={channelId}
        channelName={channelName}
        replyTo={replyTo ? replyPreviewOf(replyTo) : null}
        onCancelReply={() => setReplyTo(null)}
        onSend={sendOwn}
        textareaRef={composerRef}
      />
      {/* Mở hộp sửa/xóa theo selection; truyền tin tương ứng và xóa selection khi đóng dialog. */}
      <MessageDialogs
        selection={selection}
        message={messages.find((message) => message.id === selection?.messageId)}
        channelId={channelId}
        onClose={() => setSelection((current) => (current === selection ? null : current))}
      />
    </div>
  );
}
