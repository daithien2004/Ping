import type { MemberUpdatedPayload, ServerUpdatedPayload, UserUpdatedPayload } from '@ping/shared';
import type { InfiniteData } from '@tanstack/react-query';
import type { MemberDto, MemberPage, ServerDetail, ServerSummary } from '@ping/shared';
import type { MessagesCache } from '@/features/messages/message-cache';
import type { MembersCache } from '@/features/members/member-cache';

/**
 * Biến đổi cache thuần cho TG.7 (đi kèm test): profile-cache là hàm thuần, component không
 * gọi queryClient trực tiếp — hooks gọi qua đây.
 */

/** user.updated: cập nhật tác giả trong mọi trang tin nhắn (tên + avatar đổi ngay). */
export function applyUserUpdatedToMessages(
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

/** user.updated: cập nhật user lồng trong từng member (panel thành viên, drawer quản trị). */
export function applyUserUpdatedToMembers(
  cache: MembersCache | undefined,
  user: UserUpdatedPayload,
): MembersCache | undefined {
  if (!cache) return cache;
  let changed = false;
  const pages = cache.pages.map((page) => {
    if (!page.members.some((m) => m.user.id === user.id)) return page;
    changed = true;
    return {
      ...page,
      members: page.members.map((m) =>
        m.user.id === user.id
          ? {
              ...m,
              user: {
                ...m.user,
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

/** member.updated: biệt danh của một thành viên vừa đổi ở server này. */
export function applyMemberUpdated(
  cache: MembersCache | undefined,
  payload: MemberUpdatedPayload,
): MembersCache | undefined {
  if (!cache) return cache;
  let changed = false;
  const pages = cache.pages.map((page) => {
    const target = page.members.find((m) => m.id === payload.memberId);
    if (!target) return page;
    changed = true;
    return {
      ...page,
      members: page.members.map((m) =>
        m.id === payload.memberId
          ? {
              ...m,
              nickname: payload.nickname,
              user: { ...m.user, ...payload.user },
            }
          : m,
      ),
    };
  });
  return changed ? { ...cache, pages } : cache;
}

/** server.updated: tên/icon server đổi — cập nhật chi tiết và hàng trong danh sách rail. */
export function applyServerUpdated(
  detail: ServerDetail | undefined,
  list: ServerSummary[] | undefined,
  payload: ServerUpdatedPayload,
): { detail: ServerDetail | undefined; list: ServerSummary[] | undefined } {
  return {
    detail:
      detail && detail.id === payload.id
        ? { ...detail, name: payload.name, iconUrl: payload.iconUrl }
        : detail,
    list: list?.map((item) =>
      item.id === payload.id ? { ...item, name: payload.name, iconUrl: payload.iconUrl } : item,
    ),
  };
}

/** Đưa thông tin user.updated vào đúng hàng member (dùng khi trả lời event ở ngoài cache members). */
export function memberWithUser(member: MemberDto, user: UserUpdatedPayload): MemberDto {
  return {
    ...member,
    user: {
      ...member.user,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  };
}

/** Kiểu trang members chỉ để tái sử dụng trong map của applyMemberUpdated khi cần dựng trang mới. */
export type MemberPageRef = InfiniteData<MemberPage, string | undefined>;
