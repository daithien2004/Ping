import type { MemberDto } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { groupByPresence, setPresence, type MembersCache } from './member-cache';

const member = (id: string, name: string, online: boolean): MemberDto => ({
  id: `m-${id}`,
  serverId: 's1',
  userId: id,
  nickname: null,
  joinedAt: '2026-10-20T00:00:00.000Z',
  user: { id, username: name, displayName: name, avatarUrl: null },
  roles: [],
  online,
});

const cache = (...pages: MemberDto[][]): MembersCache => ({
  pages: pages.map((members, index) => ({ members, hasMore: index < pages.length - 1 })),
  pageParams: pages.map((_, index) => (index === 0 ? undefined : `p${index}`)),
});

describe('setPresence', () => {
  it('flips the member on whichever page holds them', () => {
    const before = cache([member('a', 'A', false)], [member('b', 'B', false)]);
    const after = setPresence(before, 'b', true)!;
    expect(after.pages[1]!.members[0]!.online).toBe(true);
    expect(after.pages[0]!.members[0]!.online).toBe(false);
  });

  it('returns the same cache object when nothing changes (no needless re-render)', () => {
    const before = cache([member('a', 'A', true)]);
    expect(setPresence(before, 'a', true)).toBe(before);
    expect(setPresence(before, 'unknown', true)).toBe(before);
  });

  it('passes undefined through (nothing cached yet)', () => {
    expect(setPresence(undefined, 'a', true)).toBeUndefined();
  });
});

describe('groupByPresence', () => {
  it('lists online members first, each group keeping the server order', () => {
    const members = [
      member('a', 'A', false),
      member('b', 'B', true),
      member('c', 'C', false),
      member('d', 'D', true),
    ];
    const { online, offline } = groupByPresence(members);
    expect(online.map((m) => m.userId)).toEqual(['b', 'd']);
    expect(offline.map((m) => m.userId)).toEqual(['a', 'c']);
  });
});
