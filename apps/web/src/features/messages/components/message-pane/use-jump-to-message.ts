'use client';

import type { Virtualizer } from '@tanstack/react-virtual';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { ClientMessage } from '../../message-cache';

/**
 * Nhận tin nhắn đang tải, bộ cuộn và hàm tạo đường dẫn tới một tin; trả hàm nhảy tới tin,
 * cùng ID tin đang được đánh dấu sau khi nhảy để giao diện làm nổi bật trong 2 giây.
 * Ví dụ: gọi `jumpTo('m8')` → nếu m8 đã tải thì cuộn tới m8; nếu chưa, mở đường dẫn tới m8.
 */
export function useJumpToMessage({
  messages,
  virtualizer,
  messagePath,
}: {
  messages: ClientMessage[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  messagePath: (messageId: string) => string;
}) {
  const router = useRouter();
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);

  const jumpTo = useCallback(
    (messageId: string) => {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) {
        router.push(messagePath(messageId));
        return;
      }
      virtualizer.scrollToIndex(index, { align: 'center' });
      setJumpTarget(messageId);
    },
    [messages, router, messagePath, virtualizer],
  );

  useEffect(() => {
    if (!jumpTarget) return;
    const timer = setTimeout(() => setJumpTarget(null), 2000);
    return () => clearTimeout(timer);
  }, [jumpTarget]);

  return { jumpTo, jumpTarget };
}
