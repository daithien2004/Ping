import { describe, expect, it } from 'vitest';
import { reactionTokenSchema } from '../emoji';
import {
  createCustomEmojiSchema,
  customEmojiReactionToken,
  customEmojiToken,
  CUSTOM_EMOJI_TOKEN_PATTERN,
} from './custom-emoji';

const id = '019c0000-0000-7000-8000-000000000001';

describe('custom emoji contracts (TG.24, ADR-0068)', () => {
  it('accepts lowercase names and rejects uppercase, spaces and bad lengths', () => {
    expect(
      createCustomEmojiSchema.safeParse({ attachmentId: id, name: 'party_parrot' }).success,
    ).toBe(true);
    for (const name of ['Parrot', 'có dấu', 'a', 'x'.repeat(33), '']) {
      expect(createCustomEmojiSchema.safeParse({ attachmentId: id, name }).success).toBe(false);
    }
  });

  it('builds message tokens :ten:<id> and extracts them with the shared pattern', () => {
    const token = customEmojiToken('parrot', id);
    expect(token).toBe(`:parrot:${id}`);
    const text = `xin chào :parrot: ${token} xong`;
    const matches = [...text.matchAll(CUSTOM_EMOJI_TOKEN_PATTERN)];
    expect(matches).toHaveLength(1);
    expect(matches[0]![2]).toBe(id);
    // Token thiếu id KHÔNG được nhận là custom (tránh nuốt emoji shortcode thường).
    expect([...':parrot:'.matchAll(CUSTOM_EMOJI_TOKEN_PATTERN)]).toHaveLength(0);
  });

  it('reaction tokens accept unicode allowlist and c:<id>, reject everything else', () => {
    expect(reactionTokenSchema.safeParse('👍').success).toBe(true);
    expect(reactionTokenSchema.safeParse(customEmojiReactionToken(id)).success).toBe(true);
    for (const bad of ['c:not-a-uuid', 'x:abcd', `:${id}`, '']) {
      expect(reactionTokenSchema.safeParse(bad).success).toBe(false);
    }
  });
});
