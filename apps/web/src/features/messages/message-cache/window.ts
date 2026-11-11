import { mapPages, nonceKey, oldestFirst, upsertMessage } from './core';
import type { ClientMessage, MessagesCache } from './types';

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
  return mapPages(result, (rows) =>
    rows.filter(
      (message) =>
        message.status !== undefined ||
        message.id.startsWith('temp-') ||
        !(message.id > afterId && message.id <= upper && !fetchedIds.has(message.id)),
    ),
  );
}

type WindowPage = { messages: ClientMessage[]; hasMore: boolean; hasNewer?: boolean };

export function aroundWindow(page: WindowPage, aroundId: string): MessagesCache {
  return {
    pages: [{ messages: page.messages, hasMore: page.hasMore }],
    pageParams: [undefined],
    window: { aroundId, hasNewer: page.hasNewer ?? false },
  };
}

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

export function replaceWithWindow(
  cache: MessagesCache | undefined,
  page: WindowPage,
  aroundId: string,
): MessagesCache {
  const next = aroundWindow(page, aroundId);
  if (!cache) return next;
  const hidden = new Set(cache.deletedIds ?? []);
  const hiddenNonces = new Set(cache.deletedNonces ?? []);
  let result: MessagesCache = {
    ...mapPages(next, (rows) =>
      rows.filter((message) => !hidden.has(message.id) && !hiddenNonces.has(nonceKey(message))),
    ),
    deletedIds: cache.deletedIds,
    deletedNonces: cache.deletedNonces,
  };
  for (const message of oldestFirst(cache)) {
    if (message.status) result = upsertMessage(result, message) ?? result;
  }
  return result;
}
