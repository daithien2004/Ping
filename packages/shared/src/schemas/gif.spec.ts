import { describe, expect, it } from 'vitest';
import { createMessageSchema } from './message';
import { gifPayloadSchema, GIF_IMAGE_HOSTS } from './gif';

const nonce = '019d0000-0000-7000-8000-0000000000ff';
const tenorGif = {
  id: '1234567890',
  url: 'https://media.tenor.com/abcdefghijk/AAAAC/hello.gif',
  width: 498,
  height: 278,
};

describe('gif contracts (TG.25, ADR-0069)', () => {
  it('chỉ nhận URL https thuộc host allowlist', () => {
    expect(gifPayloadSchema.safeParse(tenorGif).success).toBe(true);
    expect(GIF_IMAGE_HOSTS).toContain('media.tenor.com');
    // Host lạ bị chặn ở schema — client không thể nhúng nguồn ngoài danh sách.
    for (const url of [
      'https://media.giphy.com/aaa/ZZZZ.gif',
      'https://evil.example.com/x.gif',
      'http://media.tenor.com/abcdefghijk/AAAAC/hello.gif', // http thường — không phải https
      'not-a-url',
    ]) {
      expect(gifPayloadSchema.safeParse({ ...tenorGif, url }).success).toBe(false);
    }
  });

  it('chặn kích thước phi thực tế', () => {
    for (const dims of [
      { width: 0, height: 100 },
      { width: 100, height: 0 },
      { width: 5000, height: 100 },
      { width: 100.5, height: 100 },
    ]) {
      expect(gifPayloadSchema.safeParse({ ...tenorGif, ...dims }).success).toBe(false);
    }
  });

  it('tin GIF: nội dung rỗng, không attachment, không kèm sticker', () => {
    expect(createMessageSchema.safeParse({ nonce, gif: tenorGif, content: '' }).success).toBe(true);
    expect(createMessageSchema.safeParse({ nonce, gif: tenorGif, content: 'chào' }).success).toBe(
      false,
    );
    expect(
      createMessageSchema.safeParse({ nonce, gif: tenorGif, content: '', attachmentIds: [nonce] })
        .success,
    ).toBe(false);
    expect(
      createMessageSchema.safeParse({ nonce, gif: tenorGif, content: '', stickerId: nonce })
        .success,
    ).toBe(false);
  });

  it('tin thường không đụng nhánh GIF: content rỗng hoàn toàn vẫn bị chặn', () => {
    expect(createMessageSchema.safeParse({ nonce, content: '' }).success).toBe(false);
  });
});
