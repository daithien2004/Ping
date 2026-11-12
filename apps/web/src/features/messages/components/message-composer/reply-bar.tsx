'use client';

import type { MessageReplyPreview } from '@ping/shared';
import { X } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { ReplySnippet } from '../reply-snippet';

export type ReplyTarget = MessageReplyPreview;

export function ReplyBar({ replyTo, onCancel }: { replyTo: ReplyTarget; onCancel: () => void }) {
  const t = useTranslations('messages');
  return (
    <div
      data-testid="reply-bar"
      className="mb-1 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-muted px-3 py-1.5 text-xs"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t('replyingTo', { author: replyTo.authorName })}</p>
        <p className="truncate text-muted-foreground">
          <ReplySnippet replyTo={replyTo} />
        </p>
      </div>
      <button
        type="button"
        aria-label={t('cancelReply')}
        onClick={onCancel}
        className="focus-ring shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
