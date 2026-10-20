import type { ClientMessage } from '../message-cache';

const timeFormat = new Intl.DateTimeFormat('vi', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

interface Props {
  message: ClientMessage;
  onRetry: (message: ClientMessage) => void;
}

export function MessageItem({ message, onRetry }: Props) {
  return (
    <article
      className={`px-4 py-1.5 ${message.status === 'sending' ? 'opacity-60' : ''}`}
      aria-busy={message.status === 'sending' || undefined}
    >
      <header className="flex items-baseline gap-2">
        <span className="font-semibold">{message.author.displayName}</span>
        <time dateTime={message.createdAt} className="text-xs text-gray-500">
          {timeFormat.format(new Date(message.createdAt))}
        </time>
        {message.editedAt && <span className="text-xs text-gray-500">(đã sửa)</span>}
      </header>
      {/* Văn bản thuần: React tự escape nên an toàn XSS; không bao giờ dangerouslySetInnerHTML. */}
      <p className="break-words whitespace-pre-wrap">{message.content}</p>
      {message.status === 'failed' && (
        <p className="text-xs text-red-600">
          Gửi thất bại ·{' '}
          <button type="button" onClick={() => onRetry(message)} className="underline">
            Thử lại
          </button>
        </p>
      )}
    </article>
  );
}
