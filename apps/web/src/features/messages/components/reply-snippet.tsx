'use client';

import type { MessageReplyPreview } from '@ping/shared';
import { useTranslations } from 'use-intl';

/**
 * Dòng trích của tin gốc trong khối reply/thanh reply. Tin văn bản hiện nội dung; tin
 * sticker/GIF/nhiều tệp không có content thì hiện nhãn loại để khối không bị trống.
 */
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
