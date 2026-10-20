'use client';

import { createMessageSchema } from '@ping/shared';
import { useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'use-intl';

/**
 * Ô soạn tin. Giữ `draft` ở ĐÂY (không ở MessagePane): mỗi phím gõ chỉ render lại ô soạn, không
 * render lại cả danh sách tin ảo hóa. <Activity> vẫn giữ nháp khi chuyển channel.
 */
export function MessageComposer({
  channelName,
  onSend,
}: {
  channelName: string;
  onSend: (content: string, nonce: string) => void;
}) {
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
    <div className="border-t border-gray-200 p-3 dark:border-gray-700">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        maxLength={4000}
        placeholder={label}
        aria-label={label}
        className="w-full resize-none rounded bg-gray-100 px-3 py-2 dark:bg-gray-800"
      />
    </div>
  );
}
