import type { MessageDto } from '@ping/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { preserveLocalMessages } from './core';
import { reactionsOf } from './reactions';
import {
  applyReactionIntents,
  clearReactionIntents,
  noteReactionEvent,
  settleReactionIntent,
  startReactionIntent,
} from './reaction-intents';
import { cache, msg } from './test-helpers';

const withReactions = (reactions: MessageDto['reactions']) => cache([{ ...msg('m1'), reactions }]);

beforeEach(clearReactionIntents);

describe('pending reaction intents', () => {
  it('snapshot cũ không xoá được reaction đang chờ và áp lại không đếm đôi', () => {
    startReactionIntent('m1', '👍', true);
    const stale = cache([msg('m1')]);
    expect(reactionsOf(applyReactionIntents(stale), 'm1')).toEqual([
      { emoji: '👍', count: 1, me: true },
    ]);
    const rebuilt = applyReactionIntents(preserveLocalMessages(undefined, stale));
    expect(reactionsOf(rebuilt, 'm1')).toEqual([{ emoji: '👍', count: 1, me: true }]);
    expect(reactionsOf(applyReactionIntents(rebuilt), 'm1')).toEqual([
      { emoji: '👍', count: 1, me: true },
    ]);
  });

  it('snapshot đã phản ánh cờ `me` (echo của chính mình) thì giữ nguyên, không cộng thêm', () => {
    startReactionIntent('m1', '👍', true);
    const echoed = withReactions([{ emoji: '👍', count: 1, me: true }]);
    expect(applyReactionIntents(echoed)).toBe(echoed);
  });

  it('ý định gỡ trừ đúng một, giữ emoji khác và xoá nhóm khi về 0', () => {
    startReactionIntent('m1', '👍', false);
    const snapshot = withReactions([
      { emoji: '🔥', count: 3, me: false },
      { emoji: '👍', count: 2, me: true },
    ]);
    const next = applyReactionIntents(snapshot)!;
    expect(reactionsOf(next, 'm1')).toEqual([
      { emoji: '🔥', count: 3, me: false },
      { emoji: '👍', count: 1, me: false },
    ]);
    expect(applyReactionIntents(next)).toBe(next);
  });

  it('giữ `emojiName` của emoji tùy chỉnh khi phủ ý định', () => {
    startReactionIntent('m1', 'c:t', true);
    const snapshot = withReactions([
      { emoji: 'c:t', count: 1, me: false, emojiName: 'test_emoji' },
    ]);
    expect(reactionsOf(applyReactionIntents(snapshot), 'm1')).toEqual([
      { emoji: 'c:t', count: 2, me: true, emojiName: 'test_emoji' },
    ]);
  });

  it('response mang token cũ không gỡ được ý định mới hơn', () => {
    const older = startReactionIntent('m1', '👍', true);
    const newer = startReactionIntent('m1', '👍', false);
    expect(settleReactionIntent('m1', '👍', older)).toBeNull();
    expect(settleReactionIntent('m1', '👍', newer)).toEqual({ sawEvent: false });
    const plain = cache([msg('m1')]);
    expect(applyReactionIntents(plain)).toBe(plain);
  });

  it('event realtime cùng emoji được báo lại cho phản hồi đang chờ', () => {
    const token = startReactionIntent('m1', '👍', true);
    noteReactionEvent('m1', '🔥');
    expect(settleReactionIntent('m1', '👍', token)).toEqual({ sawEvent: false });
    const second = startReactionIntent('m1', '👍', true);
    noteReactionEvent('m1', '👍');
    expect(settleReactionIntent('m1', '👍', second)).toEqual({ sawEvent: true });
  });
});
