import type { UserUpdatedPayload } from '@ping/shared';
import type { MessagesCache } from './types';

export function applyAuthorUpdated(
  cache: MessagesCache | undefined,
  user: UserUpdatedPayload,
): MessagesCache | undefined {
  if (!cache) return cache;
  let changed = false;
  const pages = cache.pages.map((page) => {
    if (!page.messages.some((m) => m.author.id === user.id)) return page;
    changed = true;
    return {
      ...page,
      messages: page.messages.map((m) =>
        m.author.id === user.id
          ? {
              ...m,
              author: {
                ...m.author,
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
              },
            }
          : m,
      ),
    };
  });
  return changed ? { ...cache, pages } : cache;
}
