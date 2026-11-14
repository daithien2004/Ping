import type { MessageReactionDto } from '@ping/shared';

export function sortReactions(reactions: MessageReactionDto[]): MessageReactionDto[] {
  return [...reactions].sort(
    (a, b) => b.count - a.count || (a.emoji < b.emoji ? -1 : a.emoji > b.emoji ? 1 : 0),
  );
}
