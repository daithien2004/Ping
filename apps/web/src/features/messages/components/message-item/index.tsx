import { memo } from 'react';
import { useFormatter, useTranslations } from 'use-intl';
import type { ClientMessage } from '../../message-cache';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { StickerMessage } from '@/features/stickers/components/sticker-message';
import { GifMessage } from '@/features/gifs/components/gif-message';
import { MessageActions, type MessageSelection } from '../message-actions';
import { MessageReactions } from '../message-reactions';
import { MarkdownText } from '../markdown-text';
import { AttachmentList } from '@/features/attachments/components/attachment-list';
import { DateDivider, FailedNotice, PinBadge, ReplyPreview } from './message-item-parts';

export interface MessageItemHandlers {
  onRetry: (message: ClientMessage) => void;
  onAction: (selection: MessageSelection) => void;
  onReply: (message: ClientMessage) => void;
  onJumpTo: (messageId: string) => void;
}

interface Props {
  message: ClientMessage;
  channelId: string;
  serverId: string | undefined;
  permalink: string;
  handlers: MessageItemHandlers;
  highlighted?: boolean;
  grouped?: boolean;
  showDate?: boolean;
  mine?: boolean;
}

/**
 * Nhận dữ liệu một tin nhắn cùng trạng thái hiển thị và callback thao tác.
 * Trả giao diện cho tin đó: nội dung (text/GIF/sticker), tác giả, thời gian, phản ứng và tệp đính kèm.
 * Ví dụ: `grouped = true` → nối tin với tin ngay trước; `status = 'failed'` → hiện nút thử gửi lại.
 */
export const MessageItem = memo(function MessageItem({
  message,
  channelId,
  serverId,
  permalink,
  handlers,
  highlighted,
  grouped = false,
  showDate = false,
  mine = false,
}: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const time = format.dateTime(new Date(message.createdAt), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const clock = format.dateTime(new Date(message.createdAt), {
    hour: '2-digit',
    minute: '2-digit',
  });
  const actions = (
    <MessageActions
      message={message}
      channelId={channelId}
      permalink={permalink}
      onAction={handlers.onAction}
      onReply={handlers.onReply}
    />
  );
  return (
    <>
      {showDate && <DateDivider createdAt={message.createdAt} />}
      <article
        id={`message-${message.id}`}
        data-message-id={message.id}
        data-highlighted={highlighted ? 'true' : undefined}
        data-mine={mine ? 'true' : undefined}
        className={`group relative px-4 pb-(--ping-message-py) leading-(--ping-message-leading) transition-colors hover:bg-accent/50 ${grouped ? 'pt-0.5' : 'pt-(--ping-message-gap)'} ${message.status === 'sending' ? 'opacity-60' : ''} ${highlighted ? 'bg-accent ring-1 ring-ring/40' : ''}`}
        aria-busy={message.status === 'sending' || undefined}
      >
        <div className="flex gap-4">
          <div className="w-10 shrink-0">
            {!grouped && (
              <UserAvatar
                name={message.author.displayName}
                avatarUrl={message.author.avatarUrl}
                size={40}
              />
            )}
          </div>
          <div data-slot="message-body" className="min-w-0 flex-1">
            {grouped ? (
              <>
                <span className="sr-only">
                  {t('messages.groupedContext', {
                    author: message.author.displayName,
                    time: clock,
                  })}
                </span>
                <div className="absolute -top-3 right-4 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  {actions}
                </div>
              </>
            ) : (
              <header className="flex items-baseline gap-2">
                <span data-slot="author" className="font-medium">
                  {message.author.displayName}
                </span>
                <time
                  dateTime={message.createdAt}
                  className="text-xs font-medium text-muted-foreground"
                >
                  {time}
                </time>
                {message.editedAt && (
                  <span className="text-xs text-muted-foreground">{t('messages.edited')}</span>
                )}
                {message.pinnedAt && (
                  <PinBadge className="size-3 shrink-0 self-center text-muted-foreground" />
                )}
                {actions}
              </header>
            )}
            {message.replyTo && (
              <ReplyPreview replyTo={message.replyTo} onJumpTo={handlers.onJumpTo} />
            )}
            {message.kind === 'sticker' ? (
              <StickerMessage sticker={message.sticker ?? null} />
            ) : message.kind === 'gif' ? (
              <GifMessage gif={message.gif ?? null} />
            ) : (
              <div data-slot="message-text">
                <MarkdownText content={message.content} serverId={serverId} />
                {message.attachments?.length ? (
                  <AttachmentList attachments={message.attachments} />
                ) : null}
              </div>
            )}
            <MessageReactions message={message} channelId={channelId} />
            {grouped && (message.editedAt || message.pinnedAt) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                {message.editedAt && <span>{t('messages.edited')}</span>}
                {message.pinnedAt && <PinBadge className="size-3" />}
              </p>
            )}
            {message.status === 'failed' && (
              <FailedNotice onRetry={() => handlers.onRetry(message)} />
            )}
          </div>
        </div>
      </article>
    </>
  );
});
