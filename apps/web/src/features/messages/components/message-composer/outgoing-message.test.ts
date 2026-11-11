import type { GifPayload, StickerDto } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { textMessage, toSendVariables } from './outgoing-message';

const nonce = '01900000-0000-7000-8000-000000000001';
const file = '01900000-0000-7000-8000-000000000002';
const reply = '01900000-0000-7000-8000-000000000003';

describe('textMessage', () => {
  it('chỉ toàn khoảng trắng và không có tệp thì không gửi', () => {
    expect(textMessage('   ', [])).toBeNull();
  });
  it('cắt khoảng trắng hai đầu', () => {
    expect(textMessage('  chào  ', [])).toEqual({ kind: 'text', content: 'chào' });
  });
  it('chỉ có tệp vẫn gửi được, nội dung rỗng', () => {
    expect(textMessage('', [file])).toEqual({ kind: 'text', content: '', attachmentIds: [file] });
  });
  it('mang theo reply khi có', () => {
    expect(textMessage('hi', [], reply)).toEqual({ kind: 'text', content: 'hi', replyToId: reply });
  });
});

describe('toSendVariables', () => {
  it('tin văn bản: bỏ khoá reply/tệp khi không có, không có preview', () => {
    expect(toSendVariables({ kind: 'text', content: 'hi' }, nonce)).toEqual({
      input: { content: 'hi', nonce },
    });
    expect(
      toSendVariables(
        { kind: 'text', content: '', attachmentIds: [file], replyToId: reply },
        nonce,
      ),
    ).toEqual({ input: { content: '', nonce, replyToId: reply, attachmentIds: [file] } });
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
