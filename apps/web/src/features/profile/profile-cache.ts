import type { MemberUpdatedPayload, ServerUpdatedPayload, UserUpdatedPayload } from '@ping/shared';
import type { InfiniteData } from '@tanstack/react-query';
import type { MemberDto, MemberPage, ServerDetail, ServerSummary } from '@ping/shared';
import type { MembersCache } from '@/features/members/member-cache';

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

export type MemberPageRef = InfiniteData<MemberPage, string | undefined>;
