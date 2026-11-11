import type { UserUpdatedPayload } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { applyAuthorUpdated } from './author';
import { author, cache, msg } from './test-helpers';

const bob = { ...author, id: 'u2', username: 'bob', displayName: 'Bob' };
const fromBob = { ...msg('m2'), authorId: bob.id, author: bob };

const updated: UserUpdatedPayload = {
  id: author.id,
  username: 'alice',
  displayName: 'Alice Đẹp',
  avatarUrl: '/api/v1/attachments/a1/file?expires=1&signature=x',
};

describe('applyAuthorUpdated', () => {
  it('đổi tên và avatar của tác giả ở mọi tin của họ, giữ nguyên tin của người khác', () => {
    const next = applyAuthorUpdated(cache([msg('m1'), fromBob]), updated);
    const [first, second] = next!.pages[0]!.messages;
    expect(first!.author.displayName).toBe('Alice Đẹp');
    expect(first!.author.avatarUrl).toContain('/attachments/a1/');
    expect(second!.author.displayName).toBe('Bob');
  });

  it('không có tin nào của người đó thì trả đúng cache cũ (không tạo object mới)', () => {
    const before = cache([fromBob]);
    expect(applyAuthorUpdated(before, updated)).toBe(before);
  });

  it('chưa có cache thì giữ nguyên undefined', () => {
    expect(applyAuthorUpdated(undefined, updated)).toBeUndefined();
  });
});
