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
