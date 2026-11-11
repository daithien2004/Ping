import type { MemberUpdatedPayload, UserUpdatedPayload } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import type { MembersCache } from '@/features/members/member-cache';
import { applyMemberUpdated, applyServerUpdated, applyUserUpdatedToMembers } from './profile-cache';

const author = {
  id: 'u1',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: null as string | null,
};
const other = { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null as string | null };

function membersCache(): MembersCache {
  return {
    pages: [
      {
        members: [
          {
            id: 'mem1',
            serverId: 's1',
            userId: 'u1',
            nickname: null,
            joinedAt: '2026-01-01T00:00:00Z',
            user: author,
            roles: [],
            online: true,
          },
          {
            id: 'mem2',
            serverId: 's1',
            userId: 'u2',
            nickname: null,
            joinedAt: '2026-01-01T00:00:00Z',
            user: other,
            roles: [],
            online: false,
          },
        ],
        hasMore: false,
      },
    ],
    pageParams: [undefined],
  };
}

const updated: UserUpdatedPayload = {
  id: 'u1',
  username: 'alice',
  displayName: 'Alice Đẹp',
  avatarUrl: '/api/v1/attachments/a1/file?expires=1&signature=x',
};

describe('profile cache (TG.7)', () => {
  it('updates the nested user of their member rows', () => {
    const next = applyUserUpdatedToMembers(membersCache(), updated);
    expect(next?.pages[0]?.members[0]?.user.displayName).toBe('Alice Đẹp');
    expect(next?.pages[0]?.members[1]?.user.displayName).toBe('Bob');
  });

  it('applies a nickname change to the right member', () => {
    const payload: MemberUpdatedPayload = {
      serverId: 's1',
      memberId: 'mem2',
      nickname: 'Bờm',
      user: { id: 'u2', displayName: 'Bob', avatarUrl: null },
    };
    const next = applyMemberUpdated(membersCache(), payload);
    expect(next?.pages[0]?.members[1]?.nickname).toBe('Bờm');
    expect(next?.pages[0]?.members[0]?.nickname).toBeNull();
  });

  it('applies server rename/icon to detail and list rows', () => {
    const detail = {
      id: 's1',
      name: 'Old',
      iconUrl: null as string | null,
      ownerId: 'u1',
      inviteCode: 'code',
      createdAt: '2026-01-01T00:00:00Z',
      channels: [],
      roles: [],
    };
    const list = [{ ...detail, memberCount: 2, channelCount: 1 }];
    const result = applyServerUpdated(detail, list, {
      id: 's1',
      name: 'New',
      iconUrl: '/api/v1/attachments/i1/file?expires=1&signature=y',
    });
    expect(result.detail?.name).toBe('New');
    expect(result.list?.[0]?.iconUrl).toContain('/attachments/i1/');
  });
});
