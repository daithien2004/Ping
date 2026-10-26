import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { ErrorCodes, type MessageDto } from '@ping/shared';
import { qk } from '@/lib/query-keys';
import { createMessageActions } from './hooks';
import { applyReaction, deleteMessage, updateMessage, type MessagesCache } from './message-cache';

const requests = vi.hoisted(() => ({
  edit: vi.fn(),
  remove: vi.fn(),
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
}));
vi.mock('./api', async (original) => ({
  ...(await original<object>()),
  editMessageRequest: requests.edit,
  deleteMessageRequest: requests.remove,
  addReactionRequest: requests.addReaction,
  removeReactionRequest: requests.removeReaction,
}));
const message: MessageDto = {
  replyTo: null,
  id: 'm1',
  authorId: 'u1',
  author: { id: 'u1', username: 'a', displayName: 'A', avatarUrl: null },
  content: 'old',
  nonce: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  editedAt: null,
  reactions: [],
};
const key = qk.messages('c1');
let client: QueryClient;
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData<MessagesCache>(key, {
    pages: [{ messages: [message], hasMore: false }],
    pageParams: [undefined],
  });
});
const current = () => client.getQueryData<MessagesCache>(key)?.pages[0]?.messages;
describe('message actions converge with realtime', () => {
  it('applies an HTTP edit without duplicating a row or changing pagination', async () => {
    requests.edit.mockResolvedValue({
      ...message,
      content: 'new',
      editedAt: '2026-10-20T01:00:00.000Z',
    });
    await createMessageActions(client, 's1', 'c1').edit({
      id: 'm1',
      content: 'new',
      beforeEditedAt: null,
    });
    expect(current()).toHaveLength(1);
    expect(current()?.[0]?.content).toBe('new');
  });
  it('an edit response arriving after deletion cannot resurrect the message', async () => {
    requests.edit.mockImplementation(async () => {
      client.setQueryData<MessagesCache>(key, (old) => deleteMessage(old, 'm1'));
      return { ...message, content: 'new', editedAt: '2026-10-20T01:00:00.000Z' };
    });
    await createMessageActions(client, 's1', 'c1').edit({
      id: 'm1',
      content: 'new',
      beforeEditedAt: null,
    });
    expect(current()).toEqual([]);
  });
  it('socket-confirmed edit wins over a lost HTTP response', async () => {
    requests.edit.mockImplementation(async () => {
      client.setQueryData<MessagesCache>(key, (old) =>
        updateMessage(old, {
          id: 'm1',
          channelId: 'c1',
          content: 'new',
          updatedAt: '2026-10-20T01:00:00.000Z',
        }),
      );
      throw new ApiError(0, ErrorCodes.SERVICE_UNAVAILABLE, 'offline');
    });
    await expect(
      createMessageActions(client, 's1', 'c1').edit({
        id: 'm1',
        content: 'new',
        beforeEditedAt: null,
      }),
    ).resolves.toMatchObject({ content: 'new' });
  });
  it('failed edit keeps the original cache; 403 marks permissions stale', async () => {
    client.setQueryData(qk.permissions('s1'), { isOwner: false, permissions: '1' });
    requests.edit.mockRejectedValue(new ApiError(403, ErrorCodes.FORBIDDEN, 'denied'));
    await expect(
      createMessageActions(client, 's1', 'c1').edit({
        id: 'm1',
        content: 'new',
        beforeEditedAt: null,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(current()?.[0]?.content).toBe('old');
    expect(client.getQueryState(qk.permissions('s1'))?.isInvalidated).toBe(true);
  });
  it('delete 404 converges to absent, while delete 403 never removes the row', async () => {
    requests.remove.mockRejectedValueOnce(new ApiError(403, ErrorCodes.FORBIDDEN, 'denied'));
    await expect(createMessageActions(client, 's1', 'c1').remove('m1')).rejects.toMatchObject({
      status: 403,
    });
    expect(current()).toHaveLength(1);
    requests.remove.mockRejectedValueOnce(new ApiError(404, ErrorCodes.NOT_FOUND, 'gone'));
    await createMessageActions(client, 's1', 'c1').remove('m1');
    expect(current()).toEqual([]);
    expect(client.getQueryData<MessagesCache>(key)?.deletedIds).toContain('m1');
  });
});

describe('reaction actions (TG.2)', () => {
  const summary = (reactions: MessageDto['reactions']) => ({ messageId: 'm1', reactions });

  it('applies the toggle optimistically, then adopts the authoritative summary', async () => {
    requests.addReaction.mockImplementation(async () => {
      // Trước khi response về, cache đã hiện cảm xúc của mình (không chờ mạng).
      expect(current()?.[0]?.reactions).toEqual([{ emoji: '👍', count: 1, me: true }]);
      return summary([{ emoji: '👍', count: 3, me: true }]);
    });
    await createMessageActions(client, 's1', 'c1').react({
      messageId: 'm1',
      emoji: '👍',
      active: true,
    });
    expect(current()?.[0]?.reactions).toEqual([{ emoji: '👍', count: 3, me: true }]);
    expect(requests.addReaction).toHaveBeenCalledWith('m1', '👍');
  });

  it('rolls back a rejected toggle (e.g. 20-emoji limit) without touching other emoji', async () => {
    client.setQueryData<MessagesCache>(key, {
      pages: [
        {
          messages: [{ ...message, reactions: [{ emoji: '🔥', count: 2, me: false }] }],
          hasMore: false,
        },
      ],
      pageParams: [undefined],
    });
    requests.addReaction.mockRejectedValue(
      new ApiError(400, ErrorCodes.REACTION_LIMIT_REACHED, 'limit'),
    );
    await expect(
      createMessageActions(client, 's1', 'c1').react({
        messageId: 'm1',
        emoji: '👍',
        active: true,
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.REACTION_LIMIT_REACHED });
    expect(current()?.[0]?.reactions).toEqual([{ emoji: '🔥', count: 2, me: false }]);
  });

  it('refetches instead of rolling back when the server may have applied the change', async () => {
    requests.removeReaction.mockRejectedValue(
      new ApiError(0, ErrorCodes.SERVICE_UNAVAILABLE, 'offline'),
    );
    await expect(
      createMessageActions(client, 's1', 'c1').react({
        messageId: 'm1',
        emoji: '👍',
        active: false,
      }),
    ).rejects.toMatchObject({ status: 0 });
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('reconciles a rejected toggle when a concurrent event has replaced its count', async () => {
    requests.addReaction.mockImplementation(async () => {
      client.setQueryData<MessagesCache>(key, (old) =>
        applyReaction(old, 'm1', { emoji: '👍', count: 2 }),
      );
      throw new ApiError(403, ErrorCodes.FORBIDDEN, 'denied');
    });
    await expect(
      createMessageActions(client, 's1', 'c1').react({
        messageId: 'm1',
        emoji: '👍',
        active: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('does not overwrite a newer realtime count with a delayed HTTP summary', async () => {
    requests.addReaction.mockImplementation(async () => {
      client.setQueryData<MessagesCache>(key, (old) =>
        applyReaction(old, 'm1', { emoji: '👍', count: 2 }),
      );
      return summary([{ emoji: '👍', count: 1, me: true }]);
    });
    await createMessageActions(client, 's1', 'c1').react({
      messageId: 'm1',
      emoji: '👍',
      active: true,
    });
    expect(current()?.[0]?.reactions).toEqual([{ emoji: '👍', count: 2, me: true }]);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
