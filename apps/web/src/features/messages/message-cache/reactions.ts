import type { MessageReactionDto } from '@ping/shared';
import { patchMessage } from './core';
import { sortReactions } from './reactions-sort';
import type { MessagesCache } from './types';

export function reactionsOf(
  cache: MessagesCache | undefined,
  messageId: string,
): MessageReactionDto[] {
  for (const page of cache?.pages ?? []) {
    const message = page.messages.find((row) => row.id === messageId);
    if (message) return message.reactions ?? [];
  }
  return [];
}

export function setReactions(
  cache: MessagesCache | undefined,
  messageId: string,
  reactions: MessageReactionDto[],
): MessagesCache | undefined {
  return patchMessage(cache, messageId, (message) => ({ ...message, reactions }));
}

export function applyReaction(
  cache: MessagesCache | undefined,
  messageId: string,
  change: { emoji: string; count: number; me?: boolean },
): MessagesCache | undefined {
  return patchMessage(cache, messageId, (message) => {
    const previous = message.reactions ?? [];
    const existing = previous.find((row) => row.emoji === change.emoji);
    const rest = previous.filter((row) => row.emoji !== change.emoji);
    const reactions =
      change.count <= 0
        ? rest
        : sortReactions([
            ...rest,
            {
              emoji: change.emoji,
              count: change.count,
              me: change.me ?? existing?.me ?? false,
              ...(existing?.emojiName ? { emojiName: existing.emojiName } : {}),
            },
          ]);
    return { ...message, reactions };
  });
}

export function toggledCount(existing: MessageReactionDto | undefined, active: boolean): number {
  const base = existing?.count ?? 0;
  if (active) return existing?.me ? base : base + 1;
  return existing?.me ? base - 1 : base;
}

export function toggleReaction(
  cache: MessagesCache | undefined,
  messageId: string,
  emoji: string,
  active: boolean,
): MessagesCache | undefined {
  const existing = reactionsOf(cache, messageId).find((row) => row.emoji === emoji);
  return applyReaction(cache, messageId, {
    emoji,
    count: toggledCount(existing, active),
    me: active,
  });
}
