import type { InfiniteData } from '@tanstack/react-query';
import type { MemberDto, MemberPage } from '@ping/shared';

export type MembersCache = InfiniteData<MemberPage, string | undefined>;

export function setPresence(
  cache: MembersCache | undefined,
  userId: string,
  online: boolean,
): MembersCache | undefined {
  if (!cache) return cache;
  let changed = false;
  const pages = cache.pages.map((page) => {
    if (!page.members.some((m) => m.userId === userId && m.online !== online)) return page;
    changed = true;
    return {
      ...page,
      members: page.members.map((m) => (m.userId === userId ? { ...m, online } : m)),
    };
  });
  return changed ? { ...cache, pages } : cache;
}

export function groupByPresence(members: MemberDto[]) {
  return {
    online: members.filter((m) => m.online),
    offline: members.filter((m) => !m.online),
  };
}
