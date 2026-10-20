import type { MessageAuthor, MessageDto, MessageUpdatedPayload } from '@ping/shared';
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
export type MessagesCache = InfiniteData<ClientMessagePage, string | undefined> & {
  deletedIds?: string[];
  deletedNonces?: string[];
};

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
  a.id === b.id || (a.nonce !== null && a.nonce === b.nonce && a.authorId === b.authorId);

const nonceKey = (message: ClientMessage) =>
  message.nonce === null ? '' : `${message.authorId}:${message.nonce}`;

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
  if (cache.deletedIds?.includes(message.id) || cache.deletedNonces?.includes(nonceKey(message))) {
    return {
      ...cache,
      deletedNonces: [
        ...new Set([...(cache.deletedNonces ?? []), nonceKey(message)].filter(Boolean)),
      ],
      pages: cache.pages.map((page) => ({
        ...page,
        messages: page.messages.filter((row) => !sameMessage(row, message)),
      })),
    };
  }
  let replaced = false;
  const pages = cache.pages.map((page) => ({
    ...page,
    messages: page.messages.flatMap((existing) => {
      if (!sameMessage(existing, message)) return [existing];
      if (replaced) return []; // bản trùng thứ hai trở đi: bỏ
      replaced = true;
      return [
        existing.editedAt && existing.editedAt > (message.editedAt ?? '') ? existing : message,
      ];
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
        message.nonce === nonce && message.status ? { ...message, status } : message,
      ),
    })),
  };
}

export const markFailed = (cache: MessagesCache | undefined, nonce: string) =>
  setStatus(cache, nonce, 'failed');

export function updateMessage(
  cache: MessagesCache | undefined,
  event: MessageUpdatedPayload,
): MessagesCache | undefined {
  if (!cache) return cache;
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.id === event.id && (!message.editedAt || message.editedAt < event.updatedAt)
          ? { ...message, content: event.content, editedAt: event.updatedAt }
          : message,
      ),
    })),
  };
}

export function deleteMessage(
  cache: MessagesCache | undefined,
  id: string,
): MessagesCache | undefined {
  if (!cache) return cache;
  return {
    ...cache,
    deletedIds: [...new Set([...(cache.deletedIds ?? []), id])],
    pages: cache.pages.map((page) => ({
      ...page,
      messages: page.messages.filter((message) => message.id !== id),
    })),
  };
}

/** REST remains authoritative; only unconfirmed local sends survive a refetch. */
export function preserveLocalMessages(
  before: MessagesCache | undefined,
  after: MessagesCache,
): MessagesCache {
  const deletedNonces = [
    ...new Set([...(before?.deletedNonces ?? []), ...(after.deletedNonces ?? [])]),
  ];
  let result = deletedNonces.length
    ? {
        ...after,
        deletedNonces,
        pages: after.pages.map((page) => ({
          ...page,
          messages: page.messages.filter((message) => !deletedNonces.includes(nonceKey(message))),
        })),
      }
    : after;
  for (const id of before?.deletedIds ?? []) result = deleteMessage(result, id) ?? result;
  for (const message of oldestFirst(before)) {
    if (
      message.status &&
      !deletedNonces.includes(nonceKey(message)) &&
      !after.pages.some((page) => page.messages.some((row) => sameMessage(row, message)))
    ) {
      result = upsertMessage(result, message) ?? result;
    }
  }
  return result;
}
