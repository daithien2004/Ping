import { Pin } from 'lucide-react';
import { useFormatter, useTranslations } from 'use-intl';
import { useServerAbility } from '@/features/permissions/context';
import type { ClientMessage } from '../../message-cache';

export function DateDivider({ createdAt }: { createdAt: string }) {
  const format = useFormatter();
  return (
    <p
      data-testid="date-divider"
      className="mx-4 mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground"
    >
      <span aria-hidden className="h-px flex-1 bg-border" />
      {format.dateTime(new Date(createdAt), { dateStyle: 'long' })}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </p>
  );
}

export function PinBadge({ className }: { className: string }) {
  const t = useTranslations('messages');
  return (
    <Pin
      role="img"
      aria-label={t('pinnedBadge')}
      data-testid="pin-indicator"
      className={className}
    />
  );
}

export function ReplyPreview({
  replyTo,
  onJumpTo,
}: {
  replyTo: NonNullable<ClientMessage['replyTo']>;
  onJumpTo: (messageId: string) => void;
}) {
  const t = useTranslations('messages');
  return (
    <button
      type="button"
      onClick={() => onJumpTo(replyTo.id)}
      aria-label={t('jumpToOriginal', { author: replyTo.authorName })}
      data-testid="reply-preview"
      className="mb-1 flex max-w-full items-center gap-1.5 rounded border-l-2 border-muted-foreground/50 bg-muted/50 py-0.5 pl-2 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
    >
      <span className="shrink-0 font-medium text-foreground/80">{replyTo.authorName}</span>
      <span className="truncate">{replyTo.deleted ? t('replyDeleted') : replyTo.content}</span>
    </button>
  );
}

export function FailedNotice({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations();
  const { ability, ready } = useServerAbility();
  return (
    <p className="text-xs text-destructive">
      {t('messages.failed')} ·{' '}
      <button
        type="button"
        disabled={!ready || !ability.can('create', 'Message')}
        onClick={onRetry}
        className="font-medium underline disabled:opacity-50"
      >
        {t('common.retry')}
      </button>
    </p>
  );
}
