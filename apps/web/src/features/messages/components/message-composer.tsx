'use client';

import { createMessageSchema } from '@ping/shared';
import { useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'use-intl';
import { PingTextArea } from '@/components/ui/ping-textarea';
import { useRealtime } from '@/features/realtime/context';
import { useServerAbility } from '@/features/permissions/context';

/**
 * Ô soạn tin. Giữ `draft` ở đây (không ở MessagePane): mỗi phần chỉ render lại ô soạn, không
 * render lại cả danh sách tin nhắn. <Activity> vẫn giữ nháp khi chuyển channel.
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
  const { ability, ready } = useServerAbility();
  const canSend = ability.can('create', 'Message');
  const [draft, setDraft] = useState('');
  const t = useTranslations('messages');
  const label = t('composerLabel', { channel: channelName });
  const nearLimit = draft.length >= 3600;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!ready || !canSend) return;
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
      {canSend ? (
        <>
          <PingTextArea
            disabled={!ready}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (ready && event.target.value.trim()) realtime.type(channelId);
            }}
            onKeyDown={onKeyDown}
            autoSize={{ minRows: 1, maxRows: 8 }}
            maxLength={4000}
            placeholder={label}
            aria-label={label}
            data-testid="message-composer"
          />
          {nearLimit ? (
            <p role="status" className="mt-1 text-xs text-muted-foreground">
              {draft.length}/4000
            </p>
          ) : null}
        </>
      ) : (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {t('cannotSend')}
        </p>
      )}
    </div>
  );
}
