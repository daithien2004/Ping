import { describe, expect, it } from 'vitest';
import { incomingMessage } from './announce';
import type { ClientMessage } from './message-cache';

const message = (overrides: Partial<ClientMessage> = {}): ClientMessage => ({
  id: 'm2',
  content: 'xin chào',
  nonce: null,
  editedAt: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  authorId: 'other',
  author: { id: 'other', username: 'bob', displayName: 'Bob', avatarUrl: null },
  replyTo: null,
  reactions: [],
  ...overrides,
});

describe('incomingMessage (what a screen reader should announce)', () => {
  it('announces a new last message written by someone else', () => {
    expect(incomingMessage('m1', message(), 'me')).toEqual({ author: 'Bob', content: 'xin chào' });
  });

  it('announces the first message of a channel that was empty when it was opened', () => {
    expect(incomingMessage(null, message(), 'me')).toEqual({ author: 'Bob', content: 'xin chào' });
  });

  it('stays quiet when the last message did not change (history loaded above, an edit, a refetch)', () => {
    expect(incomingMessage('m2', message(), 'me')).toBeNull();
  });

  it('stays quiet for my own messages, including ones still sending or failed', () => {
    expect(incomingMessage('m1', message({ authorId: 'me' }), 'me')).toBeNull();
    expect(incomingMessage('m1', message({ status: 'sending' }), 'me')).toBeNull();
    expect(incomingMessage('m1', message({ status: 'failed' }), 'me')).toBeNull();
  });

  it('stays quiet when there is no last message', () => {
    expect(incomingMessage('m1', undefined, 'me')).toBeNull();
  });

  it('collapses whitespace and cuts long content to 200 characters', () => {
    const long = incomingMessage('m1', message({ content: `a\n\n  b ${'x'.repeat(300)}` }), 'me');
    expect(long?.content.startsWith('a b ')).toBe(true);
    expect(long?.content.length).toBe(201);
    expect(long?.content.endsWith('…')).toBe(true);
  });
});
