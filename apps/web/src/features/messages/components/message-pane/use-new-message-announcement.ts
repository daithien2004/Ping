'use client';

import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { incomingMessage } from '../../announce';
import type { ClientMessage } from '../../message-cache';

/**
 * Trả về thông báo đã dịch khi có tin nhắn mới từ người khác ở cuối danh sách.
 * Ví dụ: thêm tin từ Bình khi bạn là An → `"Tin nhắn mới từ Bình: Chào!"`;
 * nếu tin cuối không đổi hoặc do bạn gửi thì giữ chuỗi thông báo hiện tại.
 */
export function useNewMessageAnnouncement(messages: ClientMessage[], myId: string | undefined) {
  const t = useTranslations('messages');
  const tail = messages.at(-1);
  const tailId = tail?.id ?? null;
  const [seenTailId, setSeenTailId] = useState<string | null>(tailId);
  const [announcement, setAnnouncement] = useState('');
  if (tailId !== seenTailId) {
    setSeenTailId(tailId);
    const incoming = incomingMessage(seenTailId, tail, myId);
    if (incoming) setAnnouncement(t('newMessage', incoming));
  }
  return announcement;
}
