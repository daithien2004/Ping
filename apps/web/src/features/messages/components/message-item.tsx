import { useFormatter, useTranslations } from 'use-intl';
import type { ClientMessage } from '../message-cache';
import { useServerAbility } from '@/features/permissions/context';
import { MessageActions, type MessageSelection } from './message-actions';

interface Props {
  message: ClientMessage;
  onRetry: (message: ClientMessage) => void;
  onAction: (selection: MessageSelection) => void;
  /** Tin đang được nhảy tới từ chip trích dẫn của AI. */
  highlighted?: boolean;
}

export function MessageItem({ message, onRetry, onAction, highlighted }: Props) {
  const { ability, ready } = useServerAbility();
  const t = useTranslations();
  // Theo ngôn ngữ và múi giờ của trình duyệt (LocaleProvider), không viết cứng 'vi'.
  const format = useFormatter();
  return (
    <article
      id={`message-${message.id}`}
      data-message-id={message.id}
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
        <MessageActions message={message} onAction={onAction} />
      </header>
      {/* Văn bản thuần: React tự escape nên an toàn XSS; không bao giờ dangerouslySetInnerHTML. */}
      <p className="wrap-break-word whitespace-pre-wrap">{message.content}</p>
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
