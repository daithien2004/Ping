import type {
  AttachmentDto,
  MessageAuthor,
  MessageDto,
  MessageReplyPreview,
  MessageStickerPreview,
  MessageUpdatedPayload,
} from '@ping/shared';
import { tempIdOf } from './temp-id';
import type { ClientMessage, ClientMessagePage, MessagesCache } from './types';

const REPLY_PREVIEW_LENGTH = 120;
const STICKER_URL_REUSE_MARGIN_SECONDS = 24 * 60 * 60;

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

export function oldestFirst(cache: { pages: ClientMessagePage[] } | undefined): ClientMessage[] {
  return (cache?.pages.flatMap((page) => page.messages) ?? []).reverse();
}

function profileUrlExpires(url: string | null): number | null {
  if (!url) return null;
  const match = /[?&]expires=(\d+)/.exec(url);
  return match ? Number(match[1]) : null;
}

function reusableUrl(before: string | null, after: string | null): string | null {
  if (!before) return after;
  const expires = profileUrlExpires(before);
  return expires !== null && expires > Date.now() / 1000 + STICKER_URL_REUSE_MARGIN_SECONDS
    ? before
    : after;
}

function keepStickerUrls(
  before: MessageStickerPreview | null | undefined,
  after: MessageStickerPreview | null | undefined,
): MessageStickerPreview | null | undefined {
  if (!before || !after || before.id !== after.id || before.deleted || after.deleted) return after;
  const url = reusableUrl(before.url, after.url);
  const previewUrl = reusableUrl(before.previewUrl, after.previewUrl);
  return url === after.url && previewUrl === after.previewUrl
    ? after
    : { ...after, url, previewUrl };
}

function withStickerUrls(existing: ClientMessage, incoming: ClientMessage): ClientMessage {
  if (!incoming.sticker) return incoming;
  const sticker = keepStickerUrls(existing.sticker, incoming.sticker);
  return sticker === incoming.sticker ? incoming : { ...incoming, sticker };
}

function stickerUrlsByMessage(messages: ClientMessage[]): Map<string, MessageStickerPreview> {
  const map = new Map<string, MessageStickerPreview>();
  for (const message of messages) {
    if (!message.sticker) continue;
    map.set(message.id, message.sticker);
    if (message.nonce !== null) map.set(nonceKey(message), message.sticker);
  }
  return map;
}

function carryStickerUrls(
  previous: Map<string, MessageStickerPreview>,
  cache: MessagesCache,
): MessagesCache {
  let changed = false;
  const pages = cache.pages.map((page) => {
    let pageChanged = false;
    const messages = page.messages.map((row) => {
      if (!row.sticker) return row;
      const before = previous.get(row.id) ?? previous.get(nonceKey(row));
      const sticker = keepStickerUrls(before, row.sticker);
      if (sticker === row.sticker) return row;
      pageChanged = true;
      return { ...row, sticker };
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, messages };
  });
  return changed ? { ...cache, pages } : cache;
}

export function replyPreviewOf(message: ClientMessage): MessageReplyPreview {
  return {
    id: message.id,
    authorName: message.author.displayName,
    content: message.content.slice(0, REPLY_PREVIEW_LENGTH),
    deleted: false,
    kind: message.kind ?? 'text',
    ...(message.attachments?.length ? { attachmentCount: message.attachments.length } : {}),
  };
}

export function optimisticMessage(
  input: {
    content: string;
    nonce: string;
    attachments?: AttachmentDto[];
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
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
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
        existing.editedAt && existing.editedAt > (message.editedAt ?? '')
          ? existing
          : withStickerUrls(existing, message),
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
  const previousMessages = oldestFirst(before);
  for (const message of previousMessages) {
    if (
      message.status &&
      !deletedNonces.includes(nonceKey(message)) &&
      !after.pages.some((page) => page.messages.some((row) => sameMessage(row, message)))
    ) {
      result = upsertMessage(result, message) ?? result;
    }
  }
  result = carryStickerUrls(stickerUrlsByMessage(previousMessages), result);
  return after.window === undefined && before?.window
    ? { ...result, window: before.window }
    : result;
}
