import { useFormatter, useTranslations } from 'use-intl';
import type { ClientMessage } from '../message-cache';

interface Props {
  message: ClientMessage;
  onRetry: (message: ClientMessage) => void;
}

export function MessageItem({ message, onRetry }: Props) {
  const t = useTranslations();
  // Theo ngôn ngữ và múi giờ của trình duyệt (LocaleProvider), không viết cứng 'vi'.
  const format = useFormatter();
  return (
    <article
      className={`px-4 py-1.5 ${message.status === 'sending' ? 'opacity-60' : ''}`}
      aria-busy={message.status === 'sending' || undefined}
    >
      <header className="flex items-baseline gap-2">
        <span className="font-semibold">{message.author.displayName}</span>
        <time dateTime={message.createdAt} className="text-xs text-gray-500">
          {format.dateTime(new Date(message.createdAt), {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
        {message.editedAt && <span className="text-xs text-gray-500">{t('messages.edited')}</span>}
      </header>
      {/* Văn bản thuần: React tự escape nên an toàn XSS; không bao giờ dangerouslySetInnerHTML. */}
      <p className="break-words whitespace-pre-wrap">{message.content}</p>
      {message.status === 'failed' && (
        <p className="text-xs text-red-600">
          {t('messages.failed')} ·{' '}
          <button type="button" onClick={() => onRetry(message)} className="underline">
            {t('common.retry')}
          </button>
        </p>
      )}
    </article>
  );
}
