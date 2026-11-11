import { QueryClient } from '@tanstack/react-query';
import { ErrorCodes } from '@ping/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { MessagesCache } from '../message-cache';
import { cache, ids, msg } from '../message-cache/test-helpers';
import { loadNewer, resetWindow, seedAround } from './use-permalink-actions';

const api = vi.hoisted(() => ({ listMessagesAfter: vi.fn(), listMessagesAround: vi.fn() }));
vi.mock('../api', async (original) => ({ ...(await original<object>()), ...api }));

const key = qk.messages('c1');
let client: QueryClient;
const current = () => client.getQueryData<MessagesCache>(key);
const inWindow = (): MessagesCache => ({
  ...cache([msg('m5'), msg('m4')]),
  window: { aroundId: 'm4', hasNewer: true },
});

beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient();
  client.setQueryData<MessagesCache>(key, cache([msg('m2'), msg('m1')]));
});

describe('resetWindow', () => {
  it('cache thường không bị đặt lại', async () => {
    const reset = vi.spyOn(client, 'resetQueries');
    await resetWindow(client, 'c1');
    expect(reset).not.toHaveBeenCalled();
  });

  it('cache đang là cửa sổ thì đặt lại để tải trang mới nhất', async () => {
    client.setQueryData<MessagesCache>(key, inWindow());
    const reset = vi.spyOn(client, 'resetQueries').mockResolvedValue();
    await resetWindow(client, 'c1');
    expect(reset).toHaveBeenCalledWith({ queryKey: key, exact: true });
  });
});

describe('seedAround', () => {
  it('nạp cửa sổ quanh tin đích và trả ok', async () => {
    api.listMessagesAround.mockResolvedValue({
      messages: [msg('m9'), msg('m8')],
      hasMore: true,
      hasNewer: true,
    });
    await expect(seedAround(client, 'c1', 'm8')).resolves.toBe('ok');
    expect(current()?.window).toEqual({ aroundId: 'm8', hasNewer: true });
    expect(ids(current())![0]).toEqual(['m9', 'm8']);
  });

  it.each([404, 403])('API trả %i thì báo tin không còn (missing)', async (status) => {
    api.listMessagesAround.mockRejectedValue(new ApiError(status, ErrorCodes.NOT_FOUND, 'x'));
    await expect(seedAround(client, 'c1', 'm8')).resolves.toBe('missing');
  });

  it('lỗi khác thì ném lại', async () => {
    api.listMessagesAround.mockRejectedValue(
      new ApiError(500, ErrorCodes.SERVICE_UNAVAILABLE, 'x'),
    );
    await expect(seedAround(client, 'c1', 'm8')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('loadNewer', () => {
  it('cache thường thì không làm gì', async () => {
    await loadNewer(client, 'c1');
    expect(api.listMessagesAfter).not.toHaveBeenCalled();
  });

  it('nối trang mới hơn vào đầu cửa sổ và cập nhật hasNewer', async () => {
    client.setQueryData<MessagesCache>(key, inWindow());
    api.listMessagesAfter.mockResolvedValue({ messages: [msg('m6'), msg('m7')], hasMore: false });
    await loadNewer(client, 'c1');
    expect(api.listMessagesAfter).toHaveBeenCalledWith('c1', 'm5');
    expect(ids(current())![0]).toEqual(['m7', 'm6']);
    expect(current()?.window?.hasNewer).toBe(false);
  });
});
