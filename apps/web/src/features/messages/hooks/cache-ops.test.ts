import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { qk } from '@/lib/query-keys';
import type { MessagesCache } from '../message-cache';
import { refetchMessages, writeMessages } from './cache-ops';

const key = qk.messages('c1');
const empty: MessagesCache = { pages: [{ messages: [], hasMore: false }], pageParams: [undefined] };
let client: QueryClient;

beforeEach(() => {
  client = new QueryClient();
  client.setQueryData<MessagesCache>(key, empty);
});

describe('writeMessages', () => {
  it('áp thay đổi lên cache của kênh', async () => {
    await writeMessages(client, 'c1', (old) => (old ? { ...old, deletedIds: ['x'] } : old));
    expect(client.getQueryData<MessagesCache>(key)?.deletedIds).toEqual(['x']);
  });

  it('bỏ qua khi phiên đã dừng (isActive trả false)', async () => {
    await writeMessages(
      client,
      'c1',
      (old) => (old ? { ...old, deletedIds: ['x'] } : old),
      () => false,
    );
    expect(client.getQueryData<MessagesCache>(key)?.deletedIds).toBeUndefined();
  });
});

describe('refetchMessages', () => {
  it('đánh dấu cache của đúng kênh là cũ', async () => {
    await refetchMessages(client, 'c1');
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
