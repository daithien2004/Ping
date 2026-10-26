import { describe, expect, it } from 'vitest';
import { isAllowedReactionEmoji, reactionEmojiSchema } from './emoji';

describe('reaction emoji allowlist (TG.2)', () => {
  it('accepts single- and multi-codepoint emoji from the picker dataset', () => {
    expect(isAllowedReactionEmoji('👍')).toBe(true);
    expect(isAllowedReactionEmoji('❤️')).toBe(true); // base + variation selector
    expect(isAllowedReactionEmoji('🧑‍💻')).toBe(true); // ZWJ sequence
    expect(isAllowedReactionEmoji('🧑‍⚕️')).toBe(true);
  });

  it('accepts exactly one skin-tone modifier after a base emoji', () => {
    expect(isAllowedReactionEmoji('👍🏻')).toBe(true);
    expect(isAllowedReactionEmoji('👍🏿')).toBe(true);
    expect(isAllowedReactionEmoji('👍🏻🏻')).toBe(false);
    expect(isAllowedReactionEmoji('🏻')).toBe(false);
  });

  it('rejects text, HTML, two different emoji and oversized input', () => {
    for (const value of ['x', 'hello', '<script>', '👍👎', '👍 ', '👍\u200b', '']) {
      expect(isAllowedReactionEmoji(value), value).toBe(false);
    }
    expect(reactionEmojiSchema.safeParse('a'.repeat(33)).success).toBe(false);
  });

  it('schema returns the same verdict as the predicate', () => {
    expect(reactionEmojiSchema.safeParse('🎉').success).toBe(true);
    expect(reactionEmojiSchema.safeParse('not-an-emoji').success).toBe(false);
  });
});
