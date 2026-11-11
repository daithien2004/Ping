import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { qk } from '@/lib/query-keys';
import type { MessagesCache } from '../message-cache';
import { cache, ids, msg } from '../message-cache/test-helpers';
import { patchFromTail, reloadWindow } from './use-channel-sync';

const api = vi.hoisted(() => ({
  listMessages: vi.fn(),
  listMessagesAfter: vi.fn(),
  listMessagesAround: vi.fn(),
}));
vi.mock('../api', async (original) => ({ ...(await original<object>()), ...api }));

const key = qk.messages('c1');
let client: QueryClient;
const invalidated = () => client.getQueryState(key)?.isInvalidated;
const current = () => client.getQueryData<MessagesCache>(key);

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient();
  client.setQueryData<MessagesCache>(key, cache([msg('m2'), msg('m1')]));
});

describe('patchFromTail', () => {
  it('cache trống hoặc tin cuối là tin tạm thì tải lại thay vì vá', async () => {
    await patchFromTail(client, 'c1', undefined);
    expect(invalidated()).toBe(true);
    client.setQueryData(key, current());
    await patchFromTail(client, 'c1', 'temp-n1');
    expect(invalidated()).toBe(true);
    expect(api.listMessagesAfter).not.toHaveBeenCalled();
  });

  it('vá khoảng trống từ tin cuối, gộp cả trang mới nhất, không trùng', async () => {
    api.listMessagesAfter.mockResolvedValue({ messages: [msg('m3'), msg('m4')], hasMore: false });
    api.listMessages.mockResolvedValue({ messages: [msg('m5'), msg('m4')], hasMore: false });
    await patchFromTail(client, 'c1', 'm2');
    expect(ids(current())![0]).toEqual(['m5', 'm4', 'm3', 'm2', 'm1']);
  });

  it('lặp qua các trang `after` cho tới khi hết', async () => {
    api.listMessagesAfter
      .mockResolvedValueOnce({ messages: [msg('m3')], hasMore: true })
      .mockResolvedValueOnce({ messages: [msg('m4')], hasMore: false });
    api.listMessages.mockResolvedValue({ messages: [], hasMore: false });
    await patchFromTail(client, 'c1', 'm2');
    expect(api.listMessagesAfter).toHaveBeenNthCalledWith(2, 'c1', 'm3');
    expect(ids(current())![0]).toEqual(['m4', 'm3', 'm2', 'm1']);
  });

  it('bỏ qua kết quả nếu trong lúc chờ cache đã thành cửa sổ permalink', async () => {
    api.listMessagesAfter.mockImplementation(async () => {
      client.setQueryData<MessagesCache>(key, {
        ...cache([msg('m2'), msg('m1')]),
        window: { aroundId: 'm1', hasNewer: true },
      });
      return { messages: [msg('m3')], hasMore: false };
    });
    api.listMessages.mockResolvedValue({ messages: [msg('m3')], hasMore: false });
    await patchFromTail(client, 'c1', 'm2');
    expect(ids(current())![0]).toEqual(['m2', 'm1']);
    expect(current()?.window).toEqual({ aroundId: 'm1', hasNewer: true });
  });

  it('lỗi mạng thì tải lại', async () => {
    api.listMessagesAfter.mockRejectedValue(new Error('offline'));
    await patchFromTail(client, 'c1', 'm2');
    expect(invalidated()).toBe(true);
  });
});

describe('reloadWindow', () => {
  it('nạp lại đúng cửa sổ quanh tin đích', async () => {
    api.listMessagesAround.mockResolvedValue({
      messages: [msg('m9'), msg('m8')],
      hasMore: true,
      hasNewer: true,
    });
    await reloadWindow(client, 'c1', 'm8');
    expect(current()?.window).toEqual({ aroundId: 'm8', hasNewer: true });
    expect(ids(current())![0]).toEqual(['m9', 'm8']);
  });

  it('tin đích không còn thì quay về trang mới nhất (tải lại)', async () => {
    api.listMessagesAround.mockRejectedValue(new Error('404'));
    await reloadWindow(client, 'c1', 'm8');
    expect(invalidated()).toBe(true);
  });
});
