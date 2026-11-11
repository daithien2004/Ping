import type { ClientMessage } from './message-cache';

const MAX_LENGTH = 200;

export function incomingMessage(
  previousTailId: string | null,
  tail: ClientMessage | undefined,
  myId: string | undefined,
): { author: string; content: string } | null {
  if (!tail || tail.id === previousTailId || tail.authorId === myId || tail.status) {
    return null;
  }
  const flat = tail.content.replace(/\s+/g, ' ').trim();
  return {
    author: tail.author.displayName,
    content: flat.length > MAX_LENGTH ? `${flat.slice(0, MAX_LENGTH)}…` : flat,
  };
}
