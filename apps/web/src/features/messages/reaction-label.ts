import { CUSTOM_EMOJI_REACTION_PATTERN } from '@ping/shared';

export function customReactionId(emoji: string): string | null {
  return CUSTOM_EMOJI_REACTION_PATTERN.exec(emoji)?.[1] ?? null;
}

export function reactionLabel(input: {
  emoji: string;
  resolvedName?: string;
  emojiName?: string;
  deletedLabel: string;
}): string {
  if (customReactionId(input.emoji) === null) return input.emoji;
  const name = input.resolvedName ?? input.emojiName;
  return name ? `:${name}:` : input.deletedLabel;
}
