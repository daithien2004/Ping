import { describe, expect, it } from 'vitest';
import { updateMessageSchema } from './message';
import { myServerPermissionsSchema } from './server';

describe('message editing contracts', () => {
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
