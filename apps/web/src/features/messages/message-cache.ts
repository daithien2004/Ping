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

/** TG.5: cache đang là cửa sổ quanh một tin (permalink), không phải từ tin mới nhất. */
export interface MessagesWindow {
  /** Tin đích của permalink — nạp lại đúng cửa sổ này khi reconnect. */
  aroundId: string;
  /** Còn tin MỚI hơn cửa sổ (tải tiếp bằng `after` = tin mới nhất đang có). */
  hasNewer: boolean;
}

/** Trang 0 = mới nhất; trong mỗi trang tin xếp mới → cũ (đúng thứ tự API trả). */
export type MessagesCache = InfiniteData<ClientMessagePage, string | undefined> & {
  deletedIds?: string[];
  deletedNonces?: string[];
  window?: MessagesWindow;
};

/** Danh sách để hiển thị: tin cũ ở trên, mới ở dưới. */
export function oldestFirst(cache: { pages: ClientMessagePage[] } | undefined): ClientMessage[] {
  return (cache?.pages.flatMap((page) => page.messages) ?? []).reverse();
}

export function optimisticMessage(
  input: { content: string; nonce: string },
  author: MessageAuthor,
  replyTo: MessageDto['replyTo'] = null,
): ClientMessage {
  return {
    id: `temp-${input.nonce}`,
    content: input.content,
    nonce: input.nonce,
    editedAt: null,
    createdAt: new Date().toISOString(),
    authorId: author.id,
    author,
    replyTo,
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
    // Chèn vào đúng vị trí theo id (T4.5): event có thể ĐẢO THỨ TỰ (hai instance API phát
    // gần như đồng thời qua Redis pub/sub) — prepend vô điều kiện sẽ để m4 trên m5 mãi mãi.
    // Trang 0 mới nhất trước; tin mới hơn mọi thứ thuộc đầu trang 0, cũ hơn rơi vào trang
    // chứa khoảng id của nó (vá khoảng trống), không có trang nào khớp thì xuống cuối trang
    // cuối cùng (cũ hơn toàn bộ cache).
    insertSorted(pages, message);
  }
  return { ...cache, pages };
}

/** Chèn `message` vào trang đúng theo id: trong trang giảm dần, đứng trước phần tử nhỏ hơn. */
function insertSorted(pages: ClientMessagePage[], message: ClientMessage): void {
  for (let p = 0; p < pages.length; p += 1) {
    const rows = pages[p]!.messages;
    // Tin mới hơn tin CŨ NHẤT của trang này → thuộc trang này (hoặc trang trước đã xét).
    const oldestOfPage = rows[rows.length - 1];
    if (oldestOfPage === undefined || message.id > oldestOfPage.id) {
      const index = rows.findIndex((row) => row.id < message.id);
      const at = index === -1 ? rows.length : index;
      pages[p] = { ...pages[p]!, messages: [...rows.slice(0, at), message, ...rows.slice(at)] };
      return;
    }
  }
  // Cũ hơn mọi tin đã có: cuối trang cuối.
  const last = pages[pages.length - 1]!;
  pages[pages.length - 1] = {
    ...last,
    messages: [...last.messages, message],
  };
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
  // TG.5: `fetchNextPage` của infinite query dựng lại `{pages, pageParams}` TỪ ĐẦU (không spread
  // dữ liệu cũ), nên metadata cửa sổ permalink mất nếu không giữ ở đây — mất cờ `hasNewer` thì
  // nút "Tải tin mới hơn" biến mất ngay sau lần tải tin cũ đầu tiên. Writer của TG.5 luôn đặt
  // `window` trong `after` nên giá trị của `after` thắng; `resetQueries` xóa hẳn cache nên rời
  // permalink vẫn về trang mới nhất.
  return after.window === undefined && before?.window
    ? { ...result, window: before.window }
    : result;
}

/**
 * Vá khoảng trống sau reconnect (T4.4, ADR-0044). `fetched` là TOÀN BỘ tin server trả về cho
 * khoảng `(afterId, …]` (tăng dần, đã lặp hết hasMore): upsert từng tin về đúng chỗ; các tin
 * trong cache nằm TRONG khoảng đã fetch mà vắng mặt ở server nghĩa là đã bị xóa lúc offline →
 * bỏ đi. Chỉ xét tới id lớn nhất của fetched: tin đến sau đó (event socket chạy song song)
 * không thuộc phạm vi và phải giữ. Tin optimistic cục bộ không bao giờ bị bỏ.
 */
export function patchGap(
  cache: MessagesCache | undefined,
  afterId: string,
  fetched: ClientMessage[],
  { prune = true }: { prune?: boolean } = {},
): MessagesCache | undefined {
  if (!cache) return cache;
  let result = cache;
  for (const message of fetched) {
    result = upsertMessage(result, message) ?? result;
  }
  const upper = fetched.at(-1)?.id;
  if (upper === undefined || !prune) return result;
  const fetchedIds = new Set(fetched.map((message) => message.id));
  return {
    ...result,
    pages: result.pages.map((page) => ({
      ...page,
      messages: page.messages.filter(
        (message) =>
          message.status !== undefined ||
          message.id.startsWith('temp-') ||
          !(message.id > afterId && message.id <= upper && !fetchedIds.has(message.id)),
      ),
    })),
  };
}

/**
 * TG.5: thay cache bằng cửa sổ quanh tin đích của permalink (một trang). `pageParam` vẫn là
 * `undefined` để `getNextPageParam` của infinite query nối tiếp các trang CŨ hơn như bình thường.
 */
export function aroundWindow(
  page: { messages: ClientMessage[]; hasMore: boolean; hasNewer?: boolean },
  aroundId: string,
): MessagesCache {
  return {
    pages: [{ messages: page.messages, hasMore: page.hasMore }],
    pageParams: [undefined],
    window: { aroundId, hasNewer: page.hasNewer ?? false },
  };
}

/**
 * TG.5: nối một trang MỚI HƠN vào cửa sổ permalink. API `after` trả tăng dần nên đảo lại cho
 * đúng quy ước trang (mới → cũ), rồi chèn lên đầu `pages` (trang 0 = mới nhất).
 */
export function prependNewer(
  cache: MessagesCache | undefined,
  page: { messages: ClientMessage[]; hasMore: boolean },
): MessagesCache | undefined {
  if (!cache?.window) return cache;
  return {
    ...cache,
    pages: [{ messages: [...page.messages].reverse(), hasMore: false }, ...cache.pages],
    pageParams: [undefined, ...cache.pageParams],
    window: { ...cache.window, hasNewer: page.hasMore },
  };
}

/**
 * TG.5: thay cache bằng cửa sổ permalink nhưng giữ các bất biến của cache cũ: id/nonce đã xóa
 * không được sống lại, tin optimistic chưa xác nhận vẫn còn (chưa nằm trong cửa sổ server trả).
 */
export function replaceWithWindow(
  cache: MessagesCache | undefined,
  page: { messages: ClientMessage[]; hasMore: boolean; hasNewer?: boolean },
  aroundId: string,
): MessagesCache {
  const next = aroundWindow(page, aroundId);
  if (!cache) return next;
  const hidden = new Set(cache.deletedIds ?? []);
  const hiddenNonces = new Set(cache.deletedNonces ?? []);
  let result: MessagesCache = {
    ...next,
    deletedIds: cache.deletedIds,
    deletedNonces: cache.deletedNonces,
    pages: next.pages.map((row) => ({
      ...row,
      messages: row.messages.filter(
        (message) => !hidden.has(message.id) && !hiddenNonces.has(nonceKey(message)),
      ),
    })),
  };
  for (const message of oldestFirst(cache)) {
    if (message.status) result = upsertMessage(result, message) ?? result;
  }
  return result;
}
