import { Pin } from 'lucide-react';
import { memo } from 'react';
import { useFormatter, useTranslations } from 'use-intl';
import type { ClientMessage } from '../message-cache';
import { useServerAbility } from '@/features/permissions/context';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { StickerMessage } from '@/features/stickers/components/sticker-message';
import { GifMessage } from '@/features/gifs/components/gif-message';
import { MessageActions, type MessageSelection } from './message-actions';
import { MessageReactions } from './message-reactions';
import { MarkdownText } from './markdown-text';
import { AttachmentList } from '@/features/attachments/components/attachment-list';

interface Props {
  message: ClientMessage;
  /** TG.2: kênh chứa tin — mutation cảm xúc khoá theo (user, channel) và cache theo kênh. */
  channelId: string;
  /** TG.24: server chứa kênh — resolve emoji tùy chỉnh `:ten:<id>` trong nội dung tin.
   *  TG.9: `undefined` với DM (không thuộc server nào, ADR-0070). */
  serverId: string | undefined;
  /** TG.5: permalink tương đối của tin (menu "Sao chép liên kết"). */
  permalink: string;
  onRetry: (message: ClientMessage) => void;
  onAction: (selection: MessageSelection) => void;
  /** TG.1: đặt tin này làm đích trả lời trong composer. */
  onReply: (message: ClientMessage) => void;
  /** Nhảy tới tin gốc của reply; tin chưa tải → mở permalink (TG.5). */
  onJumpTo: (messageId: string) => void;
  /** Tin đang được nhảy tới từ chip trích dẫn của AI hoặc permalink. */
  highlighted?: boolean;
  /** D3: thuộc khối của tin trước — ẩn tên/giờ, siết khoảng cách trên. */
  grouped?: boolean;
  /** D3: tin đầu ngày — chèn vạch ngày phía trên. */
  showDate?: boolean;
}

export const MessageItem = memo(function MessageItem({
  message,
  channelId,
  serverId,
  permalink,
  onRetry,
  onAction,
  onReply,
  onJumpTo,
  highlighted,
  grouped = false,
  showDate = false,
}: Props) {
  const { ability, ready } = useServerAbility();
  const t = useTranslations();
  // Theo ngôn ngữ và múi giờ của trình duyệt (LocaleProvider), không viết cứng 'vi'.
  const format = useFormatter();
  const replyTo = message.replyTo;
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
  return (
    <>
      {showDate && (
        <p
          data-testid="date-divider"
          className="mx-4 mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"
        >
          <span aria-hidden className="h-px flex-1 bg-border" />
          {format.dateTime(new Date(message.createdAt), { dateStyle: 'long' })}
          <span aria-hidden className="h-px flex-1 bg-border" />
        </p>
      )}
      <article
        id={`message-${message.id}`}
        data-message-id={message.id}
        data-highlighted={highlighted ? 'true' : undefined}
        // TG.13: mật độ khối tin nhắn điều khiển qua biến CSS trên <html> (data-density).
        // D3: tin trong cùng khối chỉ giữ padding dưới, tin mở khối nhận thêm khoảng cách nhóm.
        className={`group relative px-4 pb-(--ping-message-py) leading-(--ping-message-leading) transition-colors hover:bg-accent/50 ${grouped ? 'pt-0.5' : 'pt-(--ping-message-gap)'} ${message.status === 'sending' ? 'opacity-60' : ''} ${highlighted ? 'bg-accent ring-1 ring-ring/40' : ''}`}
        aria-busy={message.status === 'sending' || undefined}
      >
        {/* Discord: avatar 40 px ở tin mở khối; nội dung thụt 72 px (16 lề + 40 avatar + 16 gap).
            Tin trong cùng khối giữ nguyên cột avatar rỗng nên vẫn thẳng hàng. */}
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
          <div className="min-w-0 flex-1">
            {grouped ? (
              <>
                {/* Ẩn tên khỏi mắt nhưng không giấu khỏi trình đọc màn hình: mỗi tin vẫn đủ ngữ cảnh. */}
                <span className="sr-only">
                  {t('messages.groupedContext', {
                    author: message.author.displayName,
                    time: clock,
                  })}
                </span>
                {/* Tin trong khối vẫn phải thao tác được: nút "…" hiện khi rê chuột hoặc khi
                bàn phím tab vào, thay cho hàng header đã ẩn. */}
                <div className="absolute -top-3 right-4 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <MessageActions
                    message={message}
                    channelId={channelId}
                    permalink={permalink}
                    onAction={onAction}
                    onReply={onReply}
                  />
                </div>
              </>
            ) : (
              <header className="flex items-baseline gap-2">
                <span className="font-medium">{message.author.displayName}</span>
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
                  <Pin
                    role="img"
                    aria-label={t('messages.pinnedBadge')}
                    data-testid="pin-indicator"
                    className="size-3 shrink-0 self-center text-muted-foreground"
                  />
                )}
                <MessageActions
                  message={message}
                  channelId={channelId}
                  permalink={permalink}
                  onAction={onAction}
                  onReply={onReply}
                />
              </header>
            )}
            {replyTo && (
              <button
                type="button"
                onClick={() => onJumpTo(replyTo.id)}
                aria-label={t('messages.jumpToOriginal', { author: replyTo.authorName })}
                data-testid="reply-preview"
                className="mb-1 flex max-w-full items-center gap-1.5 rounded border-l-2 border-muted-foreground/50 bg-muted/50 py-0.5 pl-2 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                <span className="shrink-0 font-medium text-foreground/80">
                  {replyTo.authorName}
                </span>
                <span className="truncate">
                  {replyTo.deleted ? t('messages.replyDeleted') : replyTo.content}
                </span>
              </button>
            )}
            {/* TG.22: tin sticker render ảnh thay vì markdown/attachment; TG.25: tin GIF render ảnh
          Tenor cùng cách. Tin văn bản đi qua AST allowlist (TG.4, ADR-0054) — không đường sinh
          HTML; tin optimistic vẫn hiện thường. */}
            {message.kind === 'sticker' ? (
              <StickerMessage sticker={message.sticker ?? null} />
            ) : message.kind === 'gif' ? (
              <GifMessage gif={message.gif ?? null} />
            ) : (
              <>
                <MarkdownText content={message.content} serverId={serverId} />
                {message.attachments?.length ? (
                  <AttachmentList attachments={message.attachments} />
                ) : null}
              </>
            )}
            <MessageReactions message={message} channelId={channelId} />
            {grouped && (message.editedAt || message.pinnedAt) && (
              // Header đã ẩn: trạng thái sửa/ghim xuống dưới nội dung thay vì mất theo header.
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                {message.editedAt && <span>{t('messages.edited')}</span>}
                {message.pinnedAt && (
                  <Pin
                    role="img"
                    aria-label={t('messages.pinnedBadge')}
                    data-testid="pin-indicator"
                    className="size-3"
                  />
                )}
              </p>
            )}
            {message.status === 'failed' && (
              <p className="text-xs text-destructive">
                {t('messages.failed')} ·{' '}
                <button
                  type="button"
                  disabled={!ready || !ability.can('create', 'Message')}
                  onClick={() => onRetry(message)}
                  className="font-medium underline disabled:opacity-50"
                >
                  {t('common.retry')}
                </button>
              </p>
            )}
          </div>
        </div>
      </article>
    </>
  );
});
