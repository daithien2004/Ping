import type { MessageDto } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import {
  applyReaction,
  applyPin,
  reactionsOf,
  setReactions,
  toggleReaction,
  toggledCount,
} from './index';
import { msg, cache, ids } from './test-helpers';

describe('reactions', () => {
  const withReactions = (id: string, reactions: MessageDto['reactions']) => ({
    ...msg(id),
    reactions,
  });

  it('toggleReaction chỉ đổi đúng emoji của người xem, giữ emoji khác và thứ tự count', () => {
    const base = cache([
      withReactions('m1', [
        { emoji: '🔥', count: 3, me: false },
        { emoji: '👍', count: 1, me: false },
      ]),
    ]);
    const added = toggleReaction(base, 'm1', '👍', true)!;
    expect(reactionsOf(added, 'm1')).toEqual([
      { emoji: '🔥', count: 3, me: false },
      { emoji: '👍', count: 2, me: true },
    ]);
    const removed = toggleReaction(added, 'm1', '👍', false)!;
    expect(reactionsOf(removed, 'm1')).toEqual([
      { emoji: '🔥', count: 3, me: false },
      { emoji: '👍', count: 1, me: false },
    ]);
    const single = toggleReaction(
      cache([withReactions('m1', [{ emoji: '👍', count: 1, me: true }])]),
      'm1',
      '👍',
      false,
    )!;
    expect(reactionsOf(single, 'm1')).toEqual([]);
  });

  it('applyReaction lấy count của event làm chuẩn và giữ cờ `me` khi người khác thả', () => {
    const base = cache([withReactions('m1', [{ emoji: '👍', count: 1, me: true }])]);
    const other = applyReaction(base, 'm1', { emoji: '👍', count: 2 })!;
    expect(reactionsOf(other, 'm1')).toEqual([{ emoji: '👍', count: 2, me: true }]);
    const own = applyReaction(other, 'm1', { emoji: '👍', count: 0, me: false })!;
    expect(reactionsOf(own, 'm1')).toEqual([]);
    expect(ids(applyReaction(base, 'missing', { emoji: '👍', count: 1 }))).toEqual(ids(base));
  });

  it('applyReaction giữ `emojiName` của emoji tùy chỉnh khi event realtime đổi số đếm', () => {
    const token = 'c:01a1b017-9dec-7381-886a-28c02713f875';
    const base = cache([
      withReactions('m1', [{ emoji: token, count: 1, me: false, emojiName: 'test_emoji' }]),
    ]);
    const updated = applyReaction(base, 'm1', { emoji: token, count: 2 })!;
    expect(reactionsOf(updated, 'm1')).toEqual([
      { emoji: token, count: 2, me: false, emojiName: 'test_emoji' },
    ]);
    const plain = applyReaction(cache([withReactions('m1', [])]), 'm1', { emoji: '👍', count: 1 })!;
    expect(reactionsOf(plain, 'm1')).toEqual([{ emoji: '👍', count: 1, me: false }]);
  });

  it('setReactions thay toàn bộ nhóm bằng response chuẩn, không đụng tin khác', () => {
    const base = cache([
      withReactions('m2', [{ emoji: '🔥', count: 9, me: false }]),
      withReactions('m1', [{ emoji: '👍', count: 1, me: true }]),
    ]);
    const next = setReactions(base, 'm1', [
      { emoji: '🎉', count: 2, me: true },
      { emoji: '👍', count: 1, me: false },
    ])!;
    expect(reactionsOf(next, 'm1')).toEqual([
      { emoji: '🎉', count: 2, me: true },
      { emoji: '👍', count: 1, me: false },
    ]);
    expect(reactionsOf(next, 'm2')).toEqual([{ emoji: '🔥', count: 9, me: false }]);
  });

  it('applyPin chỉ đổi trạng thái ghim của đúng tin, cả hai chiều', () => {
    const base = cache([msg('m1'), msg('m2')]);
    const pinned = applyPin(base, {
      messageId: 'm2',
      pinnedAt: '2026-10-26T10:00:00.000Z',
      pinnedById: 'u2',
    })!;
    expect(pinned.pages[0]!.messages.find((row) => row.id === 'm2')).toMatchObject({
      pinnedAt: '2026-10-26T10:00:00.000Z',
      pinnedById: 'u2',
    });
    expect(pinned.pages[0]!.messages.find((row) => row.id === 'm1')?.pinnedAt).toBeNull();
    const unpinned = applyPin(pinned, { messageId: 'm2', pinnedAt: null, pinnedById: null })!;
    expect(unpinned.pages[0]!.messages.find((row) => row.id === 'm2')?.pinnedAt).toBeNull();
    expect(
      applyPin(undefined, { messageId: 'm2', pinnedAt: null, pinnedById: null }),
    ).toBeUndefined();
  });
});

describe('toggledCount', () => {
  const reaction = (count: number, me: boolean) => ({ emoji: '👍', count, me });

  it('bật khi chưa thả thì cộng một, đã thả thì giữ nguyên', () => {
    expect(toggledCount(undefined, true)).toBe(1);
    expect(toggledCount(reaction(3, false), true)).toBe(4);
    expect(toggledCount(reaction(3, true), true)).toBe(3);
  });
  it('tắt khi đã thả thì trừ một, chưa thả thì không trừ', () => {
    expect(toggledCount(reaction(3, true), false)).toBe(2);
    expect(toggledCount(reaction(3, false), false)).toBe(3);
    expect(toggledCount(undefined, false)).toBe(0);
  });
});
