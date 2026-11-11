import { describe, expect, it } from 'vitest';
import type { ClientMessage } from '../../message-cache';
import { msg } from '../../message-cache/test-helpers';
import { retryVariables } from './retry-variables';

const failed = (overrides: Partial<ClientMessage> = {}): ClientMessage => ({
  ...msg('temp-n1', 'n1', 'xin chào'),
  status: 'failed',
  ...overrides,
});

describe('retryVariables', () => {
  it('tin không có nonce thì không gửi lại được', () => {
    expect(retryVariables(failed({ nonce: null }))).toBeNull();
  });

  it('tin chữ: gửi lại đúng nội dung với đúng nonce cũ, không kèm khoá thừa', () => {
    expect(retryVariables(failed())).toEqual({
      kind: 'text',
      variables: { input: { content: 'xin chào', nonce: 'n1' } },
    });
  });

  it('tin chữ: mang theo reply và tệp đang chờ', () => {
    const plan = retryVariables(
      failed({
        replyTo: { id: 'm0', authorName: 'A', content: 'gốc', deleted: false },
        pendingAttachmentIds: ['f1'],
      }),
    );
    expect(plan?.variables.input).toEqual({
      content: 'xin chào',
      nonce: 'n1',
      replyToId: 'm0',
      attachmentIds: ['f1'],
    });
  });

  it('tin chữ: tệp đã tải xong thì lấy id từ danh sách tệp', () => {
    const plan = retryVariables(
      failed({ attachments: [{ id: 'f2' } as NonNullable<ClientMessage['attachments']>[number]] }),
    );
    expect(plan?.variables.input.attachmentIds).toEqual(['f2']);
  });

  it('sticker: gửi lại stickerId, preview là sticker đang hiện', () => {
    const sticker = {
      id: 's1',
      name: 'x',
      deleted: false,
      url: 'u',
      previewUrl: 'p',
      width: 1,
      height: 1,
    };
    expect(retryVariables(failed({ kind: 'sticker', sticker, content: '' }))).toEqual({
      kind: 'sticker',
      variables: {
        input: { content: '', nonce: 'n1', stickerId: 's1' },
        preview: { sticker },
      },
    });
  });

  it('gif: dựng lại payload từ gifId và preview', () => {
    const gif = { url: 'https://x/y.gif', width: 3, height: 4, provider: 'tenor' as const };
    expect(retryVariables(failed({ kind: 'gif', gif, gifId: 'g1', content: '' }))).toEqual({
      kind: 'gif',
      variables: {
        input: { content: '', nonce: 'n1', gif: { id: 'g1', url: gif.url, width: 3, height: 4 } },
        preview: { gif },
      },
    });
  });

  it('gif thiếu gifId hoặc preview thì không gửi lại được', () => {
    const gif = { url: 'u', width: 1, height: 1, provider: 'tenor' as const };
    expect(retryVariables(failed({ kind: 'gif', gif }))).toBeNull();
    expect(retryVariables(failed({ kind: 'gif', gifId: 'g1' }))).toBeNull();
  });
});
