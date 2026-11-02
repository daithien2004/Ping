import { describe, expect, it } from 'vitest';
import { GROUP_WINDOW_MS, groupMessages } from './grouping';
import type { ClientMessage } from './message-cache';

const at = (minute: number, day = 20) =>
  `2026-10-${day}T10:${String(minute).padStart(2, '0')}:00.000Z`;

const message = (overrides: Partial<ClientMessage> = {}): ClientMessage => ({
  id: 'm1',
  content: 'xin chào',
  nonce: null,
  editedAt: null,
  createdAt: at(0),
  authorId: 'u1',
  author: { id: 'u1', username: 'an', displayName: 'An', avatarUrl: null },
  replyTo: null,
  reactions: [],
  pinnedAt: null,
  pinnedById: null,
  ...overrides,
});

describe('groupMessages (D3 — nhóm tin theo người gửi)', () => {
  it('tin đầu danh sách luôn mở khối và có vạch ngày', () => {
    const [row] = groupMessages([message()]);
    expect(row).toMatchObject({ grouped: false, showDate: true });
  });

  it('cùng tác giả trong 5 phút thì gộp (biên đúng 5:00 vẫn gộp)', () => {
    const rows = groupMessages([
      message({ id: 'm1', createdAt: at(0) }),
      message({ id: 'm2', createdAt: at(4) }),
      message({ id: 'm3', createdAt: at(5) }),
    ]);
    expect(rows.map((row) => row.grouped)).toEqual([false, true, true]);
    expect(GROUP_WINDOW_MS).toBe(300_000);
  });

  it('quá 5 phút thì mở khối mới', () => {
    const rows = groupMessages([
      message({ id: 'm1', createdAt: at(0) }),
      message({ id: 'm2', createdAt: '2026-10-20T10:05:01.000Z' }),
    ]);
    expect(rows[1]?.grouped).toBe(false);
  });

  it('đổi tác giả thì mở khối mới', () => {
    const rows = groupMessages([
      message({ id: 'm1' }),
      message({ id: 'm2', authorId: 'u2', createdAt: at(1) }),
    ]);
    expect(rows[1]?.grouped).toBe(false);
  });

  it('tin trả lời luôn mở khối mới dù cùng tác giả', () => {
    const rows = groupMessages([
      message({ id: 'm1' }),
      message({
        id: 'm2',
        createdAt: at(1),
        replyTo: { id: 'm0', authorName: 'Bình', content: 'cũ', deleted: false },
      }),
    ]);
    expect(rows[1]?.grouped).toBe(false);
  });

  it('sang ngày khác thì vừa có vạch ngày vừa mở khối mới', () => {
    const rows = groupMessages([
      message({ id: 'm1', createdAt: at(50, 20) }),
      message({ id: 'm2', createdAt: at(10, 21) }),
    ]);
    expect(rows[1]).toMatchObject({ grouped: false, showDate: true });
  });

  it('vạch ngày không phụ thuộc việc tin đó có mở khối hay không', () => {
    const rows = groupMessages([
      message({ id: 'm1', createdAt: at(0) }),
      message({ id: 'm2', createdAt: at(1) }),
    ]);
    expect(rows[1]).toMatchObject({ grouped: true, showDate: false });
  });
});
