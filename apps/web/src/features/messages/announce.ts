import type { ClientMessage } from './message-cache';

const MAX_LENGTH = 200;

/**
 * Tin nào cần được trình đọc màn hình đọc lên (aria-live, ADR-0029): CHỈ tin mới nhất do người khác
 * viết. Không đọc tin của mình (kể cả đang gửi/thất bại), không đọc khi tải thêm lịch sử phía trên
 * hay khi sửa tin (tin cuối không đổi). `previousTailId` là id tin cuối đã thấy ở lần render trước;
 * `null` nghĩa là channel đang rỗng lúc mở, nên tin đầu tiên của người khác vẫn được đọc.
 */
export function incomingMessage(
  previousTailId: string | null,
  tail: ClientMessage | undefined,
  myId: string | undefined,
): { author: string; content: string } | null {
  if (!tail || tail.id === previousTailId || tail.authorId === myId || tail.status) {
    return null;
  }
  const flat = tail.content.replace(/\s+/g, ' ').trim();
  return {
    author: tail.author.displayName,
    content: flat.length > MAX_LENGTH ? `${flat.slice(0, MAX_LENGTH)}…` : flat,
  };
}
