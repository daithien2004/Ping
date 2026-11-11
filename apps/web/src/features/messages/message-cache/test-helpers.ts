import type { MessageDto } from '@ping/shared';
import type { MessagesCache } from './index';

export const author = { id: 'u1', username: 'a', displayName: 'A', avatarUrl: null };

export const msg = (id: string, nonce: string | null = null, content = id): MessageDto => ({
  id,
  content,
  nonce,
  editedAt: null,
  pinnedAt: null,
  pinnedById: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  authorId: author.id,
  author,
  replyTo: null,
  reactions: [],
});

export const cache = (...pages: MessageDto[][]): MessagesCache => ({
  pages: pages.map((messages, index) => ({ messages, hasMore: index < pages.length - 1 })),
  pageParams: pages.map((_, index) => (index === 0 ? undefined : `p${index}`)),
});

export const ids = (data: MessagesCache | undefined) =>
  data?.pages.map((page) => page.messages.map((message) => message.id));
