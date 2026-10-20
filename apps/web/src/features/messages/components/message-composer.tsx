'use client';

import { createMessageSchema } from '@ping/shared';
import { useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'use-intl';
import { Textarea } from '@/components/ui/textarea';
import { useRealtime } from '@/features/realtime/context';

/**
 * Ô soạn tin. Giữ `draft` ở ĐÂY (không ở MessagePane): mỗi phím gõ chỉ render lại ô soạn, không
 * render lại cả danh sách tin ảo hóa. <Activity> vẫn giữ nháp khi chuyển channel.
 */
export function MessageComposer({
  channelId,
  channelName,
  onSend,
}: {
  channelId: string;
  channelName: string;
  onSend: (content: string, nonce: string) => void;
}) {
  const realtime = useRealtime();
  const [draft, setDraft] = useState('');
  const t = useTranslations('messages');
  const label = t('composerLabel', { channel: channelName });

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return; // Shift+Enter xuống dòng; đang gõ dấu (IME) thì Enter là chọn chữ, không phải gửi.
    }
    event.preventDefault();
    // nonce sinh MỘT lần cho mỗi tin; gửi lại dùng đúng nonce này (server chặn trùng).
    const parsed = createMessageSchema.safeParse({ content: draft, nonce: crypto.randomUUID() });
    if (!parsed.success) {
      return; // rỗng hoặc toàn khoảng trắng: không gửi
    }
    onSend(parsed.data.content, parsed.data.nonce);
    setDraft('');
  }

  return (
    <div className="shrink-0 px-4 pb-4">
      <Textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (event.target.value.trim()) realtime.type(channelId);
        }}
        onKeyDown={onKeyDown}
        rows={1}
        maxLength={4000}
        placeholder={label}
        aria-label={label}
        className="max-h-48 min-h-11 resize-none rounded-lg border-0 bg-muted px-4 py-3 shadow-none dark:bg-muted"
      />
    </div>
  );
}
