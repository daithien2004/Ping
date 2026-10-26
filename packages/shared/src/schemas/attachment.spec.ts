import { describe, expect, it } from 'vitest';
import { createMessageSchema } from './message';
import { createUploadSchema } from './attachment';

const nonce = '01900000-0000-7000-8000-000000000001';
describe('attachment contracts', () => {
  it('accepts attachment-only messages and rejects empty messages', () => {
    expect(
      createMessageSchema.safeParse({ content: '', nonce, attachmentIds: [nonce] }).success,
    ).toBe(true);
    expect(createMessageSchema.safeParse({ content: ' ', nonce }).success).toBe(false);
    expect(
      createMessageSchema.safeParse({ content: '', nonce, attachmentIds: Array(6).fill(nonce) })
        .success,
    ).toBe(false);
  });
  it('rejects oversized files and unsafe filenames', () => {
    for (const input of [
      { filename: 'x.png', sizeBytes: 10 * 1024 * 1024 + 1 },
      { filename: '../x.png', sizeBytes: 1 },
      { filename: 'x\r\nInjected: header', sizeBytes: 1 },
    ])
      expect(createUploadSchema.safeParse({ ...input, channelId: nonce, nonce }).success).toBe(
        false,
      );
  });
});
