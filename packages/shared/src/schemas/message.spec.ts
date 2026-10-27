import { describe, expect, it } from 'vitest';
import { createMessageSchema, updateMessageSchema } from './message';
import { myServerPermissionsSchema } from './server';

describe('message editing contracts', () => {
  it('preserves a valid reply target and rejects malformed targets', () => {
    const input = { content: 'reply', nonce: '01900000-0000-7000-8000-000000000001' };
    const replyToId = '01900000-0000-7000-8000-000000000002';
    expect(createMessageSchema.parse({ ...input, replyToId })).toEqual({ ...input, replyToId });
    for (const replyToId of ['', 'invalid', null]) {
      expect(createMessageSchema.safeParse({ ...input, replyToId }).success).toBe(false);
    }
  });
  it('trims content and enforces the same 1–4000 limit in both apps', () => {
    expect(updateMessageSchema.parse({ content: '  edited  ' })).toEqual({ content: 'edited' });
    for (const content of ['', '   ', 'a'.repeat(4001)]) {
      expect(updateMessageSchema.safeParse({ content }).success).toBe(false);
    }
    expect(updateMessageSchema.safeParse({ content: 'a'.repeat(4000) }).success).toBe(true);
  });
  it('rejects malformed permission responses instead of guessing authorization', () => {
    expect(myServerPermissionsSchema.parse({ isOwner: false, permissions: '131' })).toEqual({
      isOwner: false,
      permissions: '131',
    });
    for (const permissions of ['-1', '1.5', 'oops', '', 3]) {
      expect(myServerPermissionsSchema.safeParse({ isOwner: false, permissions }).success).toBe(
        false,
      );
    }
    expect(myServerPermissionsSchema.safeParse({ permissions: '1' }).success).toBe(false);
  });
});

describe('sticker messages (TG.22, ADR-0067)', () => {
  const nonce = '01900000-0000-7000-8000-000000000002';
  const stickerId = '01900000-0000-7000-8000-000000000003';

  it('accepts a sticker message with empty content', () => {
    const parsed = createMessageSchema.parse({ content: '', nonce, stickerId });
    expect(parsed.stickerId).toBe(stickerId);
  });

  it('rejects sticker messages carrying text or message attachments', () => {
    expect(createMessageSchema.safeParse({ content: 'chào', nonce, stickerId }).success).toBe(
      false,
    );
    expect(
      createMessageSchema.safeParse({ content: '', nonce, stickerId, attachmentIds: [nonce] })
        .success,
    ).toBe(false);
  });

  it('keeps text messages intact without stickerId', () => {
    expect(createMessageSchema.safeParse({ content: 'chào', nonce }).success).toBe(true);
    expect(createMessageSchema.safeParse({ content: '', nonce }).success).toBe(false);
  });
});
