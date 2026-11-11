import type {
  MessageCreatedPayload,
  MessagePinnedPayload,
  ReactionChangedPayload,
} from '@ping/shared';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { qk } from '@/lib/query-keys';
import type { MessagesCache } from '../message-cache';
import { author, cache, ids, msg } from '../message-cache/test-helpers';
import { createMessageEventHandlers } from './use-message-events';

const key = qk.messages('c1');
let client: QueryClient;
let active: boolean;
let handlers: ReturnType<typeof createMessageEventHandlers>;
const rows = () => client.getQueryData<MessagesCache>(key)?.pages[0]?.messages ?? [];
const reactionOf = (id: string) => rows().find((row) => row.id === id)?.reactions;

const reaction = (userId: string, count: number): ReactionChangedPayload =>
  ({ channelId: 'c1', messageId: 'm1', emoji: '👍', userId, count }) as ReactionChangedPayload;

beforeEach(() => {
  active = true;
  client = new QueryClient();
  client.setQueryData<MessagesCache>(key, cache([msg('m2'), msg('m1')]));
  handlers = createMessageEventHandlers({
    queryClient: client,
    getMyId: () => 'me',
    isActive: () => active,
  });
});

describe('createMessageEventHandlers', () => {
  it('created: thêm tin mới vào cache của đúng kênh', async () => {
    await handlers.created({
      ...msg('m3'),
      channelId: 'c1',
      author,
      authorId: author.id,
    } as MessageCreatedPayload);
    expect(ids(client.getQueryData(key))![0]).toEqual(['m3', 'm2', 'm1']);
  });

  it('updated: sửa nội dung tin', async () => {
    await handlers.updated({
      id: 'm1',
      channelId: 'c1',
      content: 'mới',
      updatedAt: '2026-10-21T00:00:00.000Z',
    });
    expect(rows().find((row) => row.id === 'm1')?.content).toBe('mới');
  });

  it('deleted: bỏ tin khỏi cache', async () => {
    await handlers.deleted({ id: 'm1', channelId: 'c1' });
    expect(rows().map((row) => row.id)).toEqual(['m2']);
  });

  it('reaction của chính mình: đổi cờ me theo hành động', async () => {
    await handlers.reactionAdded(reaction('me', 1));
    expect(reactionOf('m1')).toEqual([{ emoji: '👍', count: 1, me: true }]);
    await handlers.reactionRemoved({ ...reaction('me', 0) });
    expect(reactionOf('m1')).toEqual([]);
  });

  it('reaction của người khác: lấy count của event, không đổi cờ me', async () => {
    await handlers.reactionAdded(reaction('me', 1));
    await handlers.reactionAdded(reaction('other', 2));
    expect(reactionOf('m1')).toEqual([{ emoji: '👍', count: 2, me: true }]);
  });

  it('pinned: ghim tin và đối soát danh sách ghim', async () => {
    client.setQueryData(qk.pins('c1'), []);
    await handlers.pinned({
      channelId: 'c1',
      messageId: 'm1',
      pinnedAt: '2026-10-26T10:00:00.000Z',
      pinnedById: 'u2',
    } as MessagePinnedPayload);
    expect(rows().find((row) => row.id === 'm1')?.pinnedAt).toBe('2026-10-26T10:00:00.000Z');
    expect(client.getQueryState(qk.pins('c1'))?.isInvalidated).toBe(true);
  });

  it('unpinned: bỏ ghim', async () => {
    await handlers.pinned({
      channelId: 'c1',
      messageId: 'm1',
      pinnedAt: 'x',
      pinnedById: 'u2',
    } as MessagePinnedPayload);
    await handlers.unpinned({ channelId: 'c1', messageId: 'm1' });
    expect(rows().find((row) => row.id === 'm1')?.pinnedAt).toBeNull();
  });

  it('user.updated: đổi tên tác giả trong cache tin, không đụng cache ghim (là mảng)', () => {
    const pins = [{ id: 'p1' }];
    client.setQueryData(qk.pins('c1'), pins);
    const watch = (queryKey: readonly unknown[]) =>
      new QueryObserver(client, {
        queryKey,
        queryFn: () => Promise.resolve(null),
        staleTime: Infinity,
      }).subscribe(() => {});
    const stops = [watch(key), watch(qk.pins('c1'))];

    handlers.userUpdated({ id: author.id, username: 'a', displayName: 'Mới', avatarUrl: null });

    expect(rows().every((row) => row.author.displayName === 'Mới')).toBe(true);
    expect(client.getQueryData(qk.pins('c1'))).toBe(pins);
    stops.forEach((stop) => stop());
  });

  it('phiên realtime đã dừng thì bỏ qua event', async () => {
    active = false;
    await handlers.deleted({ id: 'm1', channelId: 'c1' });
    expect(rows().map((row) => row.id)).toEqual(['m2', 'm1']);
  });
});
