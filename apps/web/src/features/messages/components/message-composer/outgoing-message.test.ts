import type { AttachmentDto, GifPayload, StickerDto } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { gifMessage, stickerMessage, textMessage, toSendVariables } from './outgoing-message';

const nonce = '01900000-0000-7000-8000-000000000001';
const file = '01900000-0000-7000-8000-000000000002';
const reply = '01900000-0000-7000-8000-000000000003';
const attachment: AttachmentDto = {
  id: file,
  filename: 'a.png',
  mime: 'image/png',
  sizeBytes: 10,
  width: 2,
  height: 3,
};

describe('textMessage', () => {
  it('chỉ toàn khoảng trắng và không có tệp thì không gửi', () => {
    expect(textMessage('   ', [])).toBeNull();
  });
  it('cắt khoảng trắng hai đầu', () => {
    expect(textMessage('  chào  ', [])).toEqual({ kind: 'text', content: 'chào' });
  });
  it('chỉ có tệp vẫn gửi được, mang DTO để tin tạm hiện ảnh ngay', () => {
    expect(textMessage('', [attachment])).toEqual({
      kind: 'text',
      content: '',
      attachments: [attachment],
    });
  });
  it('mang theo reply khi có', () => {
    expect(textMessage('hi', [], reply)).toEqual({ kind: 'text', content: 'hi', replyToId: reply });
  });
});

describe('stickerMessage và gifMessage', () => {
  const sticker = { id: file } as StickerDto;
  const gif = { id: 'g1', url: 'https://x/y.gif', width: 3, height: 4 } as GifPayload;

  it('không có reply thì không có khoá replyToId', () => {
    expect(stickerMessage(sticker)).toStrictEqual({ kind: 'sticker', sticker });
    expect(gifMessage(gif)).toStrictEqual({ kind: 'gif', gif });
  });
  it('mang theo reply khi có', () => {
    expect(stickerMessage(sticker, reply)).toStrictEqual({
      kind: 'sticker',
      sticker,
      replyToId: reply,
    });
    expect(gifMessage(gif, reply)).toStrictEqual({ kind: 'gif', gif, replyToId: reply });
  });
});

describe('toSendVariables', () => {
  it('tin văn bản: bỏ khoá reply/tệp khi không có, không có preview', () => {
    expect(toSendVariables({ kind: 'text', content: 'hi' }, nonce)).toEqual({
      input: { content: 'hi', nonce },
    });
    expect(
      toSendVariables(
        { kind: 'text', content: '', attachments: [attachment], replyToId: reply },
        nonce,
      ),
    ).toEqual({
      input: { content: '', nonce, replyToId: reply, attachmentIds: [file] },
      preview: { attachments: [attachment] },
    });
  });
  it('sticker: nội dung rỗng, kèm stickerId; preview tách riêng khỏi dữ liệu gửi API', () => {
    const sticker = {
      id: file,
      name: 'wave',
      url: 'u',
      previewUrl: 'p',
      width: 1,
      height: 2,
    } as StickerDto;
    const vars = toSendVariables({ kind: 'sticker', sticker }, nonce);
    expect(vars.input).toEqual({ content: '', nonce, stickerId: file });
    expect(vars.preview?.sticker).toMatchObject({ id: file, name: 'wave', deleted: false });
  });
  it('gif: nội dung rỗng, preview lấy kích thước từ payload', () => {
    const gif = { id: 'g1', url: 'https://x/y.gif', width: 3, height: 4 } as GifPayload;
    expect(toSendVariables({ kind: 'gif', gif, replyToId: reply }, nonce)).toEqual({
      input: { content: '', nonce, gif, replyToId: reply },
      preview: { gif: { url: gif.url, width: 3, height: 4, provider: 'tenor' } },
    });
  });
});
