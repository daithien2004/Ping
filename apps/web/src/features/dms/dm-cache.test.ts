import { describe, expect, it } from 'vitest';
import type { DmSummary } from '@ping/shared';
import { applyDmActivity, applyDmRead, dmUnreadTotal, sortedDms } from './dm-cache';

const dm = (overrides: Partial<DmSummary> & { channelId: string }): DmSummary => ({
  partner: { id: 'p', username: 'partner', displayName: 'Partner', avatarUrl: null },
  unreadCount: 0,
  lastReadMessageId: null,
  lastMessageAt: null,
  ...overrides,
});

describe('dm-cache (TG.9, ADR-0070)', () => {
  it('applyDmActivity tăng unread (trần 100) và đẩy lastMessageAt', () => {
    const old = '2026-10-01T00:00:00.000Z';
    const dms = [
      dm({ channelId: 'a', unreadCount: 99, lastMessageAt: old }),
      dm({ channelId: 'b' }),
    ];
    const next = applyDmActivity(dms, 'a');
    expect(next[0]!.unreadCount).toBe(100);
    expect(next[0]!.lastMessageAt).not.toBe(old);
    // Hội thoại chưa có trong cache: giữ nguyên, đợi lần fetch sau.
    expect(applyDmActivity(dms, 'khong-ton-tai')).toEqual(dms);
    // Trần 100 không vượt.
    expect(applyDmActivity([dm({ channelId: 'a', unreadCount: 100 })], 'a')[0]!.unreadCount).toBe(
      100,
    );
  });

  it('applyDmRead đưa unread về 0 và chốt cursor cho đúng hội thoại', () => {
    const dms = [dm({ channelId: 'a', unreadCount: 3 }), dm({ channelId: 'b', unreadCount: 1 })];
    const next = applyDmRead(dms, 'a', 'm1');
    expect(next[0]).toMatchObject({ unreadCount: 0, lastReadMessageId: 'm1' });
    expect(next[1]!.unreadCount).toBe(1);
  });

  it('sortedDms: lastMessageAt mới nhất trước, hội thoại trống nằm sau', () => {
    const dms = [
      dm({ channelId: 'old', lastMessageAt: '2026-10-01T00:00:00.000Z' }),
      dm({ channelId: 'new', lastMessageAt: '2026-10-02T00:00:00.000Z' }),
      dm({ channelId: 'blank' }),
    ];
    expect(sortedDms(dms).map((row) => row.channelId)).toEqual(['new', 'old', 'blank']);
  });

  it('dmUnreadTotal: tổng unread cho badge rail', () => {
    const dms = [dm({ channelId: 'a', unreadCount: 2 }), dm({ channelId: 'b', unreadCount: 100 })];
    expect(dmUnreadTotal(dms)).toBe(102);
    expect(dmUnreadTotal([])).toBe(0);
  });
});
