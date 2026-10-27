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

  it('sticker uploads require a serverId, forbid channelId and cap at 512 KiB (TG.22)', () => {
    const base = { scope: 'sticker', filename: 's.webp', sizeBytes: 100, nonce };
    expect(createUploadSchema.safeParse({ ...base, serverId: nonce }).success).toBe(true);
    // Không serverId → từ chối; kèm channelId → từ chối (sticker thuộc server).
    expect(createUploadSchema.safeParse(base).success).toBe(false);
    expect(
      createUploadSchema.safeParse({ ...base, serverId: nonce, channelId: nonce }).success,
    ).toBe(false);
    // Trần riêng 512 KiB chặt hơn trần hồ sơ 5 MiB.
    const oversized = {
      ...base,
      serverId: nonce,
      sizeBytes: 512 * 1024 + 1,
    };
    expect(createUploadSchema.safeParse(oversized).success).toBe(false);
  });

  it('profile uploads keep the 5 MiB cap while sticker uses its own 512 KiB cap', () => {
    const fiveMiB = 5 * 1024 * 1024;
    expect(
      createUploadSchema.safeParse({
        scope: 'avatar',
        filename: 'a.png',
        sizeBytes: fiveMiB,
        nonce,
      }).success,
    ).toBe(true);
    expect(
      createUploadSchema.safeParse({
        scope: 'sticker',
        filename: 's.webp',
        sizeBytes: fiveMiB,
        serverId: nonce,
        nonce,
      }).success,
    ).toBe(false);
  });
});
