'use client';

import type { Virtualizer } from '@tanstack/react-virtual';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { dmMessagePath } from '@/features/dms/navigation';
import { messagePath } from '@/features/servers/navigation';
import type { ClientMessage } from '../../message-cache';

/**
 * Nhận tin nhắn đang tải, bộ cuộn và ID server/channel; trả hàm tạo link, hàm nhảy tới tin,
 * cùng ID tin đang được đánh dấu sau khi nhảy để giao diện làm nổi bật trong 2 giây.
 * Ví dụ: gọi `jumpTo('m8')` → nếu m8 đã tải thì cuộn tới m8; nếu chưa, mở đường dẫn tới m8.
 */
export function useJumpToMessage({
  messages,
  virtualizer,
  serverId,
  channelId,
}: {
  messages: ClientMessage[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  serverId: string | null;
  channelId: string;
}) {
  const router = useRouter();
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);

  const permalinkOf = useCallback(
    (messageId: string) =>
      serverId === null
        ? dmMessagePath(channelId, messageId)
        : messagePath(serverId, channelId, messageId),
    [serverId, channelId],
  );

  const jumpTo = useCallback(
    (messageId: string) => {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) {
        router.push(permalinkOf(messageId));
        return;
      }
      virtualizer.scrollToIndex(index, { align: 'center' });
      setJumpTarget(messageId);
    },
    [messages, router, permalinkOf, virtualizer],
  );

  useEffect(() => {
    if (!jumpTarget) return;
    const timer = setTimeout(() => setJumpTarget(null), 2000);
    return () => clearTimeout(timer);
  }, [jumpTarget]);

  return { permalinkOf, jumpTo, jumpTarget };
}
