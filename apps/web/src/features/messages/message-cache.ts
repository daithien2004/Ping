import type { MessageAuthor, MessageDto } from '@ping/shared';
import type { InfiniteData } from '@tanstack/react-query';

/**
 * Tin nhắn trong cache của trình duyệt. `status` chỉ tồn tại phía client: tin optimistic đang gửi
 * hoặc gửi thất bại. Tin đã được server xác nhận không có `status`.
 */
export type ClientMessage = MessageDto & { status?: 'sending' | 'failed' };

export interface ClientMessagePage {
  messages: ClientMessage[];
  hasMore: boolean;
}

/** Trang 0 = mới nhất; trong mỗi trang tin xếp mới → cũ (đúng thứ tự API trả). */
export type MessagesCache = InfiniteData<ClientMessagePage, string | undefined>;

/** Danh sách để hiển thị: tin cũ ở trên, mới ở dưới. */
export function oldestFirst(cache: { pages: ClientMessagePage[] } | undefined): ClientMessage[] {
  return (cache?.pages.flatMap((page) => page.messages) ?? []).reverse();
}

export function optimisticMessage(
  input: { content: string; nonce: string },
  author: MessageAuthor,
): ClientMessage {
  return {
    id: `temp-${input.nonce}`,
    content: input.content,
    nonce: input.nonce,
    editedAt: null,
    createdAt: new Date().toISOString(),
    authorId: author.id,
    author,
    status: 'sending',
  };
}

const sameMessage = (a: ClientMessage, b: ClientMessage) =>
  a.id === b.id || (a.nonce !== null && a.nonce === b.nonce);

/**
 * Thêm hoặc cập nhật một tin. Khớp theo id HOẶC nonce, nên cùng một tin đến từ nhiều nguồn
 * (tin optimistic, response HTTP, event socket ở F5) chỉ còn một bản, giữ đúng vị trí cũ.
 * Tin chưa có thì chèn vào đầu trang mới nhất. Trả về object mới (không sửa cache cũ):
 * TanStack Query so sánh tham chiếu để quyết định re-render.
 */
export function upsertMessage(
  cache: MessagesCache | undefined,
  message: ClientMessage,
): MessagesCache | undefined {
  if (!cache) {
    return cache;
  }
  let replaced = false;
  const pages = cache.pages.map((page) => ({
    ...page,
    messages: page.messages.flatMap((existing) => {
      if (!sameMessage(existing, message)) return [existing];
      if (replaced) return []; // bản trùng thứ hai trở đi: bỏ
      replaced = true;
      return [message];
    }),
  }));
  if (!replaced && pages[0]) {
    pages[0] = { ...pages[0], messages: [message, ...pages[0].messages] };
  }
  return { ...cache, pages };
}

function setStatus(
  cache: MessagesCache | undefined,
  nonce: string,
  status: ClientMessage['status'],
): MessagesCache | undefined {
  if (!cache) {
    return cache;
  }
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.nonce === nonce ? { ...message, status } : message,
      ),
    })),
  };
}

export const markFailed = (cache: MessagesCache | undefined, nonce: string) =>
  setStatus(cache, nonce, 'failed');
