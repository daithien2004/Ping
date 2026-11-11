import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { qk } from '@/lib/query-keys';
import type { MessagesCache } from '../message-cache';
import { cache, msg } from '../message-cache/test-helpers';
import { createPinActions } from './use-pins';

const key = qk.messages('c1');
const pinsKey = qk.pins('c1');
let client: QueryClient;
let actions: ReturnType<typeof createPinActions>;
const pinnedAt = () => client.getQueryData<MessagesCache>(key)?.pages[0]?.messages[0]?.pinnedAt;

beforeEach(() => {
  client = new QueryClient();
  client.setQueryData<MessagesCache>(key, cache([msg('m1')]));
  client.setQueryData(pinsKey, []);
  actions = createPinActions(client, 'c1');
});

describe('createPinActions', () => {
  it('optimistic: ghim ngay trên cache và trả bản chụp để hoàn tác', async () => {
    const { snapshot } = await actions.optimistic({ messageId: 'm1', pin: true });
    expect(pinnedAt()).toEqual(expect.any(String));
    expect(snapshot?.pages[0]?.messages[0]?.pinnedAt).toBeNull();
  });

  it('optimistic: bỏ ghim đặt pinnedAt về null', async () => {
    await actions.optimistic({ messageId: 'm1', pin: true });
    await actions.optimistic({ messageId: 'm1', pin: false });
    expect(pinnedAt()).toBeNull();
  });

  it('confirm: lấy trạng thái từ server và đối soát danh sách ghim', () => {
    actions.confirm({
      messageId: 'm1',
      channelId: 'c1',
      pinnedAt: '2026-10-26T10:00:00.000Z',
      pinnedById: 'u2',
    });
    expect(pinnedAt()).toBe('2026-10-26T10:00:00.000Z');
    expect(client.getQueryState(pinsKey)?.isInvalidated).toBe(true);
  });

  it('rollback có bản chụp: khôi phục đúng bản chụp', async () => {
    const { snapshot } = await actions.optimistic({ messageId: 'm1', pin: true });
    actions.rollback(snapshot);
    expect(pinnedAt()).toBeNull();
    expect(client.getQueryState(pinsKey)?.isInvalidated).toBe(true);
  });

  it('rollback không có bản chụp: tải lại tin từ server', () => {
    actions.rollback(undefined);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
