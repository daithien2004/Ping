'use client';

import type { PingTextAreaRef } from '@/components/ui/ping-textarea';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { TypingIndicator } from '@/features/realtime/components/typing-indicator';
import { useMe } from '@/features/auth/hooks';
import { isDmScope, serverIdOf, type ChannelScope } from '../../channel-scope';
import { useChannelRealtime, useMessages } from '../../hooks';
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
  const isDm = isDmScope(scope);
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
  const [focusRequest, setFocusRequest] = useState(0);

  const announcement = useNewMessageAnnouncement(messages, me?.id);

  const { focusIndex, focusMissing, focusPending, hasNewer, loadingNewer, loadMoreNewer } =
    usePermalinkWindow({ channelId, focusId, messages, window: data?.window });

  const { scrollRef, virtualizer, scrollToEndOnNextAppend, atEnd, scrollToEnd } = useMessageScroll({
    channelId,
    messages,
    pageCount: data.pages.length,
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

  const tailId = messages.at(-1)?.id ?? null;
  const seenTail = useRef<string | null>(null);
  const [hasNew, setHasNew] = useState(false);
  useEffect(() => {
    if (atEnd || seenTail.current === null) {
      seenTail.current = tailId;
      setHasNew(false);
      return;
    }
    if (tailId !== seenTail.current) setHasNew(true);
  }, [atEnd, tailId]);

  const { jumpTo, jumpTarget } = useJumpToMessage({
    messages,
    virtualizer,
    messagePath: scope.messagePath,
  });
  const itemHandlers = useMemo(
    () => ({
      onRetry: retry,
      onAction: setSelection,
      onReply: (message: ClientMessage) => setReplyTo(message),
      onJumpTo: jumpTo,
    }),
    [retry, jumpTo],
  );

  if (roomDenied) return <RoomDenied />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FocusBanner missing={focusMissing} pending={focusPending} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          data-testid="message-scroll"
          data-slot="message-pane"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focus vùng cuộn là yêu cầu a11y
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto"
          aria-label={
            isDm
              ? t('dmListLabel', { name: channelName })
              : t('listLabel', { channel: channelName })
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
              <EmptyState onCompose={() => setFocusRequest((request) => request + 1)} />
            )}
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
        {hasNew && (
          <button
            type="button"
            data-testid="jump-to-present"
            onClick={() => {
              scrollToEnd();
              setHasNew(false);
            }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border bg-background px-3 py-1 text-xs font-medium shadow-overlay transition-colors hover:bg-accent"
          >
            {t('jumpToPresent')}
          </button>
        )}
      </div>

      {hasNewer && <LoadNewerBar loading={loadingNewer} onLoad={loadMoreNewer} />}

      <TypingIndicator channelId={channelId} />
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="message-announcer"
      >
        {announcement}
      </div>
      <MessageComposer
        scope={scope}
        channelId={channelId}
        channelName={channelName}
        replyTo={replyTo ? replyPreviewOf(replyTo) : null}
        onCancelReply={() => setReplyTo(null)}
        onSend={sendOwn}
        textareaRef={composerRef}
        focusRequest={focusRequest}
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
