import type { InfiniteData } from '@tanstack/react-query';
import type { MemberDto, MemberPage } from '@ping/shared';

export type MembersCache = InfiniteData<MemberPage, string | undefined>;

/** Đặt trạng thái online của một user ở trang nào đang giữ họ. Không đổi gì thì trả lại đúng object cũ. */
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

/** Online trước, mỗi nhóm giữ thứ tự của server (theo ngày vào). */
export function groupByPresence(members: MemberDto[]) {
  return {
    online: members.filter((m) => m.online),
    offline: members.filter((m) => !m.online),
  };
}
