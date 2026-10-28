import { describe, expect, it } from 'vitest';
import { notifyLevelSchema, setNotificationPrefSchema, shouldNotify } from './notification';

const now = '2026-10-29T04:00:00.000Z';
const later = '2026-10-29T05:00:00.000Z';
const earlier = '2026-10-29T03:00:00.000Z';

describe('notification prefs (TG.12)', () => {
  it('chỉ nhận ba mức', () => {
    expect(notifyLevelSchema.safeParse('all').success).toBe(true);
    expect(notifyLevelSchema.safeParse('mentions').success).toBe(true);
    expect(notifyLevelSchema.safeParse('none').success).toBe(true);
    expect(notifyLevelSchema.safeParse('quiet').success).toBe(false);
  });

  it('mutedUntil nullable, phải là datetime', () => {
    expect(setNotificationPrefSchema.safeParse({ level: 'all', mutedUntil: null }).success).toBe(
      true,
    );
    expect(setNotificationPrefSchema.safeParse({ level: 'none', mutedUntil: later }).success).toBe(
      true,
    );
    expect(setNotificationPrefSchema.safeParse({ level: 'none', mutedUntil: 'mai' }).success).toBe(
      false,
    );
  });

  it('shouldNotify: none tắt hẳn; mute trong tương lai chặn cả mention', () => {
    expect(
      shouldNotify({
        level: 'none',
        mutedUntil: null,
        isMention: true,
        isEveryone: false,
        ignoreEveryone: false,
      }),
    ).toBe(false);
    expect(
      shouldNotify({
        level: 'mentions',
        mutedUntil: later,
        isMention: true,
        isEveryone: false,
        ignoreEveryone: false,
        now,
      }),
    ).toBe(false);
    expect(
      shouldNotify({
        level: 'mentions',
        mutedUntil: earlier,
        isMention: true,
        isEveryone: false,
        ignoreEveryone: false,
        now,
      }),
    ).toBe(true);
    expect(
      shouldNotify({
        level: 'mentions',
        mutedUntil: null,
        isMention: true,
        isEveryone: false,
        ignoreEveryone: false,
      }),
    ).toBe(true);
  });

  it('shouldNotify: @everyone tùy ignoreEveryone; mức all luôn báo khi không mute', () => {
    expect(
      shouldNotify({
        level: 'mentions',
        mutedUntil: null,
        isMention: false,
        isEveryone: true,
        ignoreEveryone: false,
      }),
    ).toBe(true);
    expect(
      shouldNotify({
        level: 'mentions',
        mutedUntil: null,
        isMention: false,
        isEveryone: true,
        ignoreEveryone: true,
      }),
    ).toBe(false);
    expect(
      shouldNotify({
        level: 'all',
        mutedUntil: null,
        isMention: false,
        isEveryone: false,
        ignoreEveryone: false,
      }),
    ).toBe(true);
  });
});
