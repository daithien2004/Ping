import { Pin } from 'lucide-react';
import { useFormatter, useTranslations } from 'use-intl';
import type { ClientMessage } from '../message-cache';
import { useServerAbility } from '@/features/permissions/context';
import { StickerMessage } from '@/features/stickers/components/sticker-message';
import { MessageActions, type MessageSelection } from './message-actions';
import { MessageReactions } from './message-reactions';
import { MarkdownText } from './markdown-text';
import { AttachmentList } from '@/features/attachments/components/attachment-list';

interface Props {
  message: ClientMessage;
  /** TG.2: kênh chứa tin — mutation cảm xúc khoá theo (user, channel) và cache theo kênh. */
  channelId: string;
  /** TG.24: server chứa kênh — resolve emoji tùy chỉnh `:ten:<id>` trong nội dung tin. */
  serverId: string;
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
}

export function MessageItem({
  message,
  channelId,
  serverId,
  permalink,
  onRetry,
  onAction,
  onReply,
  onJumpTo,
  highlighted,
}: Props) {
  const { ability, ready } = useServerAbility();
  const t = useTranslations();
  // Theo ngôn ngữ và múi giờ của trình duyệt (LocaleProvider), không viết cứng 'vi'.
  const format = useFormatter();
  const replyTo = message.replyTo;
  return (
    <article
      id={`message-${message.id}`}
      data-message-id={message.id}
      data-highlighted={highlighted ? 'true' : undefined}
      className={`px-4 py-1.5 transition-colors hover:bg-accent/50 ${message.status === 'sending' ? 'opacity-60' : ''} ${highlighted ? 'bg-accent ring-1 ring-ring/40' : ''}`}
      aria-busy={message.status === 'sending' || undefined}
    >
      <header className="flex items-baseline gap-2">
        <span className="font-semibold">{message.author.displayName}</span>
        <time dateTime={message.createdAt} className="text-xs text-muted-foreground">
          {format.dateTime(new Date(message.createdAt), {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
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
      {replyTo && (
        <button
          type="button"
          onClick={() => onJumpTo(replyTo.id)}
          aria-label={t('messages.jumpToOriginal', { author: replyTo.authorName })}
          data-testid="reply-preview"
          className="mb-1 flex max-w-full items-center gap-1.5 rounded border-l-2 border-muted-foreground/50 bg-muted/50 py-0.5 pl-2 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          <span className="shrink-0 font-medium text-foreground/80">{replyTo.authorName}</span>
          <span className="truncate">
            {replyTo.deleted ? t('messages.replyDeleted') : replyTo.content}
          </span>
        </button>
      )}
      {/* TG.22: tin sticker render ảnh thay vì markdown/attachment; tin văn bản đi qua AST
          allowlist (TG.4, ADR-0054) — không đường sinh HTML; tin optimistic vẫn hiện thường. */}
      {message.kind === 'sticker' ? (
        <StickerMessage sticker={message.sticker ?? null} />
      ) : (
        <>
          <MarkdownText content={message.content} serverId={serverId} />
          {message.attachments?.length ? (
            <AttachmentList attachments={message.attachments} />
          ) : null}
        </>
      )}
      <MessageReactions message={message} channelId={channelId} />
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
    </article>
  );
}
