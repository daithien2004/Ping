import type {
  MessageAuthor,
  MessageDto,
  MessageReplyPreview,
  MessageUpdatedPayload,
} from '@ping/shared';
import { tempIdOf } from './temp-id';
import type { ClientMessage, ClientMessagePage, MessagesCache } from './types';

const REPLY_PREVIEW_LENGTH = 120;

export function mapPages(
  cache: MessagesCache,
  change: (messages: ClientMessage[]) => ClientMessage[],
): MessagesCache {
  return {
    ...cache,
    pages: cache.pages.map((page) => ({ ...page, messages: change(page.messages) })),
  };
}

export function patchMessage(
  cache: MessagesCache | undefined,
  id: string,
  change: (message: ClientMessage) => ClientMessage,
): MessagesCache | undefined {
  if (!cache) return cache;
  return mapPages(cache, (rows) => rows.map((row) => (row.id === id ? change(row) : row)));
}

export const sameMessage = (a: ClientMessage, b: ClientMessage) =>
  a.id === b.id || (a.nonce !== null && a.nonce === b.nonce && a.authorId === b.authorId);

export const nonceKey = (message: ClientMessage) =>
  message.nonce === null ? '' : `${message.authorId}:${message.nonce}`;

/**
 * Gom tin nhắn từ mọi trang thành một mảng rồi đảo thứ tự để tin cũ nhất đứng trước.
 * Ví dụ: pages = [[m5, m4], [m3, m2]] → [m2, m3, m4, m5].
 * Nếu cache chưa có thì trả về mảng rỗng.
 */
export function oldestFirst(cache: { pages: ClientMessagePage[] } | undefined): ClientMessage[] {
  return (cache?.pages.flatMap((page) => page.messages) ?? []).reverse();
}

export function replyPreviewOf(message: ClientMessage): MessageReplyPreview {
  return {
    id: message.id,
    authorName: message.author.displayName,
    content: message.content.slice(0, REPLY_PREVIEW_LENGTH),
    deleted: false,
  };
}

export function optimisticMessage(
  input: {
    content: string;
    nonce: string;
    attachmentIds?: string[];
    stickerId?: string;
    sticker?: MessageDto['sticker'];
    gif?: MessageDto['gif'];
    gifId?: string;
  },
  author: MessageAuthor,
  replyTo: MessageDto['replyTo'] = null,
): ClientMessage {
  return {
    id: tempIdOf(input.nonce),
    ...(input.attachmentIds?.length ? { pendingAttachmentIds: input.attachmentIds } : {}),
    ...(input.stickerId ? { kind: 'sticker' as const, sticker: input.sticker ?? null } : {}),
    ...(input.gif
      ? { kind: 'gif' as const, gif: input.gif, ...(input.gifId ? { gifId: input.gifId } : {}) }
      : {}),
    content: input.content,
    nonce: input.nonce,
    editedAt: null,
    createdAt: new Date().toISOString(),
    authorId: author.id,
    author,
    replyTo,
    reactions: [],
    pinnedAt: null,
    pinnedById: null,
    status: 'sending',
  };
}

/**
 * Nhận cache hiện tại và một tin; trả cache đã cập nhật, hoặc giữ nguyên `undefined` nếu chưa có cache.
 * Ví dụ: cache `[m1, m3]` + tin `m2` → `[m1, m2, m3]`; nếu tin cùng ID đã có thì thay bản cũ.
 * Nếu ID/nonce nằm trong dấu xóa, tin không được thêm lại vào danh sách.
 */
export function upsertMessage(
  cache: MessagesCache | undefined,
  message: ClientMessage,
): MessagesCache | undefined {
  if (!cache) return cache;
  if (cache.deletedIds?.includes(message.id) || cache.deletedNonces?.includes(nonceKey(message))) {
    return {
      ...mapPages(cache, (rows) => rows.filter((row) => !sameMessage(row, message))),
      deletedNonces: [
        ...new Set([...(cache.deletedNonces ?? []), nonceKey(message)].filter(Boolean)),
      ],
    };
  }
  let replaced = false;
  const next = mapPages(cache, (rows) =>
    rows.flatMap((existing) => {
      if (!sameMessage(existing, message)) return [existing];
      if (replaced) return [];
      replaced = true;
      return [
        existing.editedAt && existing.editedAt > (message.editedAt ?? '') ? existing : message,
      ];
    }),
  );
  if (!replaced && next.pages[0]) insertSorted(next.pages, message);
  return next;
}

function insertSorted(pages: ClientMessagePage[], message: ClientMessage): void {
  for (let p = 0; p < pages.length; p += 1) {
    const rows = pages[p]!.messages;
    const oldestOfPage = rows[rows.length - 1];
    if (oldestOfPage === undefined || message.id > oldestOfPage.id) {
      const index = rows.findIndex((row) => row.id < message.id);
      const at = index === -1 ? rows.length : index;
      pages[p] = { ...pages[p]!, messages: [...rows.slice(0, at), message, ...rows.slice(at)] };
      return;
    }
  }
  const last = pages[pages.length - 1]!;
  pages[pages.length - 1] = { ...last, messages: [...last.messages, message] };
}

/**
 * Nhận cache và nonce của lần gửi; đổi tin tạm tương ứng từ đang gửi sang thất bại.
 * Ví dụ: tin `{ nonce: 'n1', status: 'sending' }` → `{ nonce: 'n1', status: 'failed' }`.
 * Nếu cache chưa có thì trả lại `undefined`.
 */
export function markFailed(cache: MessagesCache | undefined, nonce: string) {
  if (!cache) return cache;
  return mapPages(cache, (rows) =>
    rows.map((row) => (row.nonce === nonce && row.status ? { ...row, status: 'failed' } : row)),
  );
}

export function updateMessage(
  cache: MessagesCache | undefined,
  event: MessageUpdatedPayload,
): MessagesCache | undefined {
  return patchMessage(cache, event.id, (message) =>
    !message.editedAt || message.editedAt < event.updatedAt
      ? { ...message, content: event.content, editedAt: event.updatedAt }
      : message,
  );
}

export function deleteMessage(
  cache: MessagesCache | undefined,
  id: string,
): MessagesCache | undefined {
  if (!cache) return cache;
  return {
    ...mapPages(cache, (rows) => rows.filter((row) => row.id !== id)),
    deletedIds: [...new Set([...(cache.deletedIds ?? []), id])],
  };
}

export function applyPin(
  cache: MessagesCache | undefined,
  change: { messageId: string; pinnedAt: string | null; pinnedById: string | null },
): MessagesCache | undefined {
  return patchMessage(cache, change.messageId, (message) => ({
    ...message,
    pinnedAt: change.pinnedAt,
    pinnedById: change.pinnedById,
  }));
}

/**
 * Ghép cache cũ (`before`) với dữ liệu mới từ server (`after`), giữ lại trạng thái cục bộ.
 *
 * Ví dụ:
 * before = {
 *   messages: [m1, temp-1(status: 'sending')],
 *   deletedIds: ['m2'],
 *   window: { aroundId: 'm1' },
 * }
 * after = { messages: [m1, m2] }
 * output = {
 *   messages: [m1, temp-1(status: 'sending')],
 *   deletedIds: ['m2'],
 *   window: { aroundId: 'm1' },
 * }
 */
export function preserveLocalMessages(
  before: MessagesCache | undefined,
  after: MessagesCache,
): MessagesCache {
  const deletedNonces = [
    ...new Set([...(before?.deletedNonces ?? []), ...(after.deletedNonces ?? [])]),
  ];
  let result = deletedNonces.length
    ? {
        ...mapPages(after, (rows) =>
          rows.filter((message) => !deletedNonces.includes(nonceKey(message))),
        ),
        deletedNonces,
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
  return after.window === undefined && before?.window
    ? { ...result, window: before.window }
    : result;
}
