import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { qk } from '@/lib/query-keys';
import type { MessagesCache } from '../message-cache';
import { author, cache, msg } from '../message-cache/test-helpers';
import { addOptimisticMessage } from './use-send-message';

const key = qk.messages('c1');
let client: QueryClient;
const first = () => client.getQueryData<MessagesCache>(key)?.pages[0]?.messages[0];

beforeEach(() => {
  client = new QueryClient();
  client.setQueryData<MessagesCache>(key, cache([msg('m1', null, 'gốc')]));
});

describe('addOptimisticMessage', () => {
  it('thêm tin tạm đang gửi vào đầu danh sách', () => {
    addOptimisticMessage(client, 'c1', author, { input: { content: 'hi', nonce: 'n1' } });
    expect(first()).toMatchObject({
      id: 'temp-n1',
      content: 'hi',
      status: 'sending',
      replyTo: null,
    });
  });

  it('dựng trích dẫn reply từ tin đích đang có trong cache', () => {
    addOptimisticMessage(client, 'c1', author, {
      input: { content: 'trả lời', nonce: 'n2', replyToId: 'm1' },
    });
    expect(first()?.replyTo).toEqual({
      id: 'm1',
      authorName: 'A',
      content: 'gốc',
      deleted: false,
      kind: 'text',
    });
  });

  it('tin đích không nằm trong cache thì không có trích dẫn', () => {
    addOptimisticMessage(client, 'c1', author, {
      input: { content: 'x', nonce: 'n3', replyToId: 'm404' },
    });
    expect(first()?.replyTo).toBeNull();
  });

  it('sticker: kind và preview lấy từ preview, không từ dữ liệu gửi API', () => {
    const sticker = {
      id: 's1',
      name: 'x',
      deleted: false,
      url: 'u',
      previewUrl: 'p',
      width: 1,
      height: 1,
    };
    addOptimisticMessage(client, 'c1', author, {
      input: { content: '', nonce: 'n4', stickerId: 's1' },
      preview: { sticker },
    });
    expect(first()).toMatchObject({ kind: 'sticker', sticker });
  });

  it('tệp đính kèm: tin tạm mang DTO upload để hiện ảnh trước khi POST trả về', () => {
    const attachments = [
      { id: 'f1', filename: 'a.png', mime: 'image/png', sizeBytes: 10, width: 2, height: 3 },
    ];
    addOptimisticMessage(client, 'c1', author, {
      input: { content: '', nonce: 'n6', attachmentIds: ['f1'] },
      preview: { attachments },
    });
    expect(first()).toMatchObject({ status: 'sending', attachments });
  });

  it('gif: giữ preview để hiện ngay và gifId để gửi lại khi lỗi', () => {
    const gif = { id: 'g1', url: 'https://x/y.gif', width: 3, height: 4 };
    const preview = { url: gif.url, width: 3, height: 4, provider: 'tenor' as const };
    addOptimisticMessage(client, 'c1', author, {
      input: { content: '', nonce: 'n5', gif },
      preview: { gif: preview },
    });
    expect(first()).toMatchObject({ kind: 'gif', gif: preview, gifId: 'g1' });
  });
});
