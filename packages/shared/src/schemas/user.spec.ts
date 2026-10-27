import { describe, expect, it } from 'vitest';
import { createUploadSchema } from './attachment';
import { updateNicknameSchema, updateProfileSchema } from './user';

const nonce = '01900000-0000-7000-8000-000000000001';
const id = '01900000-0000-7000-8000-000000000002';

describe('TG.7 profile contracts', () => {
  it('message uploads still require a channel and forbid serverId', () => {
    expect(
      createUploadSchema.safeParse({ channelId: id, nonce, filename: 'a.png', sizeBytes: 1 })
        .success,
    ).toBe(true);
    expect(createUploadSchema.safeParse({ nonce, filename: 'a.png', sizeBytes: 1 }).success).toBe(
      false,
    );
    expect(
      createUploadSchema.safeParse({
        channelId: id,
        serverId: id,
        nonce,
        filename: 'a.png',
        sizeBytes: 1,
      }).success,
    ).toBe(false);
  });

  it('avatar uploads take no channel/server; serverIcon requires the server', () => {
    expect(
      createUploadSchema.safeParse({ scope: 'avatar', nonce, filename: 'a.png', sizeBytes: 1 })
        .success,
    ).toBe(true);
    expect(
      createUploadSchema.safeParse({
        scope: 'avatar',
        channelId: id,
        nonce,
        filename: 'a.png',
        sizeBytes: 1,
      }).success,
    ).toBe(false);
    expect(
      createUploadSchema.safeParse({
        scope: 'serverIcon',
        serverId: id,
        nonce,
        filename: 'a.png',
        sizeBytes: 1,
      }).success,
    ).toBe(true);
    expect(
      createUploadSchema.safeParse({ scope: 'serverIcon', nonce, filename: 'a.png', sizeBytes: 1 })
        .success,
    ).toBe(false);
  });

  it('profile uploads are capped at 5 MiB', () => {
    expect(
      createUploadSchema.safeParse({
        scope: 'avatar',
        nonce,
        filename: 'a.png',
        sizeBytes: 5 * 1024 * 1024,
      }).success,
    ).toBe(true);
    expect(
      createUploadSchema.safeParse({
        scope: 'avatar',
        nonce,
        filename: 'a.png',
        sizeBytes: 5 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
  });

  it('PATCH /users/me needs at least one field and trimmed non-empty displayName', () => {
    expect(updateProfileSchema.safeParse({ displayName: 'Quang' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ avatarAttachmentId: id }).success).toBe(true);
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ displayName: '   ' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ displayName: 'x'.repeat(33) }).success).toBe(false);
  });

  it('nickname accepts a value or null to clear, not empty strings', () => {
    expect(updateNicknameSchema.safeParse({ nickname: 'Quàng' }).success).toBe(true);
    expect(updateNicknameSchema.safeParse({ nickname: null }).success).toBe(true);
    expect(updateNicknameSchema.safeParse({ nickname: '' }).success).toBe(false);
    expect(updateNicknameSchema.safeParse({ nickname: 'x'.repeat(33) }).success).toBe(false);
  });
});
