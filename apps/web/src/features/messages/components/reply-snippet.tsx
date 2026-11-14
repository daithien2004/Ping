'use client';

import type { MessageReplyPreview } from '@ping/shared';
import { useTranslations } from 'use-intl';

export function ReplySnippet({ replyTo }: { replyTo: MessageReplyPreview }) {
  const t = useTranslations('messages');
  if (replyTo.deleted) return <>{t('replyDeleted')}</>;
  if (replyTo.content) return <>{replyTo.content}</>;
  if (replyTo.kind === 'sticker') return <>{t('replySticker')}</>;
  if (replyTo.kind === 'gif') return <>{t('replyGif')}</>;
  if (replyTo.attachmentCount)
    return <>{t('replyAttachments', { count: replyTo.attachmentCount })}</>;
  return null;
}
