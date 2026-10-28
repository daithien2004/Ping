import { describe, expect, it } from 'vitest';
import type { ChannelUnreadDto, DmListResponse, NotificationPrefDto } from '@ping/shared';
import {
  badgeTotal,
  effectiveLevel,
  effectiveMutedUntil,
  findPref,
  hasEveryoneToken,
  mentionFlags,
  remainingMuteMinutes,
  removePref,
  upsertPref,
} from './notification-cache';

const row = (overrides: Partial<NotificationPrefDto>): NotificationPrefDto => ({
  scope: 'channel',
  targetId: 'ch-1',
  level: 'all',
  mutedUntil: null,
  ...overrides,
});

describe('findPref', () => {
  const prefs = [
    row({ scope: 'server', targetId: 'sv-1', level: 'mentions' }),
    row({ targetId: 'ch-1', level: 'none' }),
  ];

  it('tìm đúng theo scope + targetId', () => {
    expect(findPref(prefs, 'channel', 'ch-1')?.level).toBe('none');
    expect(findPref(prefs, 'server', 'sv-1')?.level).toBe('mentions');
  });

  it('trả undefined khi chưa cấu hình hoặc sai scope', () => {
    expect(findPref(prefs, 'channel', 'ch-2')).toBeUndefined();
    expect(findPref(prefs, 'server', 'ch-1')).toBeUndefined();
  });
});

describe('effectiveLevel — dòng channel → dòng server → mặc định chung', () => {
  const prefs = [
    row({ scope: 'server', targetId: 'sv-1', level: 'mentions' }),
    row({ scope: 'server', targetId: 'sv-2', level: 'none' }),
    row({ targetId: 'ch-1', level: 'all' }),
  ];

  it('override của channel thắng dòng server', () => {
    expect(effectiveLevel(prefs, 'sv-1', 'ch-1')).toBe('all');
  });

  it('kênh không có dòng thì kế thừa server', () => {
    expect(effectiveLevel(prefs, 'sv-1', 'ch-9')).toBe('mentions');
  });

  it('không có gì thì là mặc định chung (all) — kể cả DM', () => {
    expect(effectiveLevel(prefs, 'sv-3', 'ch-9')).toBe('all');
    expect(effectiveLevel(prefs, null, 'dm-1')).toBe('all');
  });

  it('DM bỏ qua dòng server (không thuộc server nào)', () => {
    expect(
      effectiveLevel([...prefs, row({ scope: 'server', targetId: 'sv-1' })], null, 'dm-1'),
    ).toBe('all');
  });
});

describe('effectiveMutedUntil — cùng nguồn với effectiveLevel', () => {
  const MUTE = '2026-01-01T10:00:00.000Z';
  const prefs = [
    row({ scope: 'server', targetId: 'sv-1', mutedUntil: MUTE }),
    row({ targetId: 'ch-1', mutedUntil: null }),
  ];

  it('dòng channel override dòng server (cả mutedUntil)', () => {
    expect(effectiveMutedUntil(prefs, 'sv-1', 'ch-1')).toBeNull();
    expect(effectiveMutedUntil(prefs, 'sv-1', 'ch-2')).toBe(MUTE);
  });

  it('DM không kế thừa server', () => {
    expect(effectiveMutedUntil(prefs, null, 'dm-1')).toBeNull();
  });
});

describe('remainingMuteMinutes', () => {
  const now = Date.parse('2026-01-01T00:00:00.000Z');

  it('null hoặc đã quá khứ → 0', () => {
    expect(remainingMuteMinutes(null, now)).toBe(0);
    expect(remainingMuteMinutes('2025-12-31T23:59:59.000Z', now)).toBe(0);
  });

  it('còn hạn → làm tròn lên phút', () => {
    expect(remainingMuteMinutes('2026-01-01T00:15:00.000Z', now)).toBe(15);
    expect(remainingMuteMinutes('2026-01-01T00:15:01.000Z', now)).toBe(16);
  });
});

describe('mentionFlags — event mention là nguồn truth, ignoreEveryone chỉ che ping @everyone', () => {
  it('được nhắc thẳng → mention kể cả khi ignoreEveryone', () => {
    expect(mentionFlags(true, false, true)).toEqual({ isMention: true, isEveryone: false });
  });

  it('@everyone không ignore → vẫn là mention', () => {
    expect(mentionFlags(true, true, false)).toEqual({ isMention: true, isEveryone: true });
  });

  it('@everyone khi ignoreEveryone → không còn là mention (shouldNotify sẽ trả false)', () => {
    expect(mentionFlags(true, true, true)).toEqual({ isMention: false, isEveryone: true });
  });

  it('không có event mention (channel.activity không mang cờ) → không phải mention', () => {
    expect(mentionFlags(false, true, false)).toEqual({ isMention: false, isEveryone: false });
  });
});

describe('hasEveryoneToken — cùng ranh giới từ với mention-parser của API', () => {
  it('nhận @everyone và @here', () => {
    expect(hasEveryoneToken('chào @everyone nha')).toBe(true);
    expect(hasEveryoneToken('@here ai đó?')).toBe(true);
  });

  it('bỏ qua email, @@ và token dính chữ', () => {
    expect(hasEveryoneToken('mailto:a@b')).toBe(false);
    expect(hasEveryoneToken('gửi @@everyone')).toBe(false);
    expect(hasEveryoneToken('x everyone')).toBe(false);
    expect(hasEveryoneToken('@everyonehere')).toBe(false);
  });
});

describe('upsertPref / removePref', () => {
  it('thêm dòng mới và thay dòng cũ không đổi thứ tự', () => {
    const first = upsertPref(undefined, row({ level: 'mentions' }));
    expect(first.prefs).toHaveLength(1);
    const second = upsertPref(first, row({ level: 'none' }));
    expect(second.prefs).toEqual([row({ level: 'none' })]);
  });

  it('removePref idempotent, giữ các dòng khác', () => {
    const prefs = { prefs: [row({ level: 'none' }), row({ scope: 'server', targetId: 'sv-1' })] };
    expect(removePref(prefs, 'channel', 'ch-1').prefs).toHaveLength(1);
    expect(removePref(prefs, 'channel', 'missing')).toEqual(prefs);
    expect(removePref(undefined, 'channel', 'ch-1')).toEqual({ prefs: [] });
  });
});

describe('badgeTotal — tổng unread server + DM (TG.12)', () => {
  const unread = (channelId: string, unreadCount: number, mentionCount = 0): ChannelUnreadDto => ({
    channelId,
    unreadCount,
    mentionCount,
    lastReadMessageId: null,
  });
  const dm = (channelId: string, unreadCount: number): DmListResponse['dms'][number] => ({
    channelId,
    partner: { id: 'u1', username: 'u1', displayName: 'U1', avatarUrl: null },
    unreadCount,
    lastReadMessageId: null,
    lastMessageAt: null,
  });

  it('cộng unread mọi server, mention không cộng kép', () => {
    expect(badgeTotal([[unread('a', 3, 2), unread('b', 1)], [unread('c', 4)]], undefined)).toBe(8);
  });

  it('cộng thêm unread DM từ cache qk.dms', () => {
    expect(badgeTotal([[unread('a', 3)]], { dms: [dm('dm-1', 2)] })).toBe(5);
  });
});
