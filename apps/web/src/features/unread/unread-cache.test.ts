import type { ChannelUnreadDto } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { applyIncoming, applyRead, firstUnreadId, totals } from './unread-cache.js';

const row = (over: Partial<ChannelUnreadDto>): ChannelUnreadDto => ({
  channelId: 'c1',
  unreadCount: 0,
  mentionCount: 0,
  lastReadMessageId: null,
  ...over,
});

describe('applyIncoming (T4.3)', () => {
  it('tăng unread khi người khác gửi', () => {
    const next = applyIncoming([row({ unreadCount: 4 })], 'c1', {
      isOwn: false,
      mention: false,
    });
    expect(next[0]!.unreadCount).toBe(5);
    expect(next[0]!.mentionCount).toBe(0);
  });

  it('tin của chính mình không tăng unread nhưng mention vẫn tăng', () => {
    const next = applyIncoming([row({ unreadCount: 4 })], 'c1', { isOwn: true, mention: true });
    expect(next[0]!.unreadCount).toBe(4);
    expect(next[0]!.mentionCount).toBe(1);
  });

  it('mention của người khác tăng cả hai', () => {
    const next = applyIncoming([row({})], 'c1', { isOwn: false, mention: true });
    expect(next[0]).toMatchObject({ unreadCount: 1, mentionCount: 1 });
  });

  it('đến trần 100 thì dừng', () => {
    const next = applyIncoming([row({ unreadCount: 100 })], 'c1', {
      isOwn: false,
      mention: false,
    });
    expect(next[0]!.unreadCount).toBe(100);
  });

  it('channel lạ (chưa có dòng) bỏ qua, không thêm dòng đoán', () => {
    expect(applyIncoming([row({})], 'other', { isOwn: false, mention: false })).toHaveLength(1);
  });
});

describe('applyRead (T4.3)', () => {
  it('đưa channel về 0/0 và cập nhật cursor', () => {
    const next = applyRead(
      [
        row({ unreadCount: 7, mentionCount: 2, lastReadMessageId: 'm1' }),
        row({ channelId: 'c2', unreadCount: 3 }),
      ],
      'c1',
      'm9',
    );
    expect(next[0]).toMatchObject({ unreadCount: 0, mentionCount: 0, lastReadMessageId: 'm9' });
    expect(next[1]!.unreadCount).toBe(3);
  });
});

describe('totals (T4.3)', () => {
  it('cộng dồn mọi channel', () => {
    expect(
      totals([
        row({ unreadCount: 5, mentionCount: 1 }),
        row({ channelId: 'c2', unreadCount: 100, mentionCount: 2 }),
      ]),
    ).toEqual({ unreadTotal: 105, mentionTotal: 3 });
  });
});

describe('firstUnreadId (T4.3)', () => {
  const unread = [row({ lastReadMessageId: 'm02' })];

  it('trả tin đầu tiên có id lớn hơn cursor (UUIDv7 so chuỗi)', () => {
    expect(firstUnreadId(unread, 'c1', ['m01', 'm02', 'm03', 'm04'])).toBe('m03');
  });

  it('đã đọc hết → null; chưa từng đọc → null (không vạch)', () => {
    expect(firstUnreadId(unread, 'c1', ['m01', 'm02'])).toBeNull();
    expect(firstUnreadId([row({ lastReadMessageId: null })], 'c1', ['m01'])).toBeNull();
    expect(firstUnreadId(undefined, 'c1', ['m01'])).toBeNull();
  });

  it('channel khác không liên quan', () => {
    expect(firstUnreadId(unread, 'c2', ['m03'])).toBeNull();
  });
});
