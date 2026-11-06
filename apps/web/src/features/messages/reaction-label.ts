import { CUSTOM_EMOJI_REACTION_PATTERN } from '@ping/shared';

/** id UUID trong token reaction `c:<id>` (TG.24); không phải token custom → null. */
export function customReactionId(emoji: string): string | null {
  return CUSTOM_EMOJI_REACTION_PATTERN.exec(emoji)?.[1] ?? null;
}

/**
 * Nhãn chữ của một reaction (aria-label, tiêu đề, tooltip). Emoji Unicode giữ nguyên; token custom
 * dùng tên theo thứ tự: tên emoji còn sống trong cache server → `emojiName` do API trả (có cả khi
 * emoji đã xóa, ADR-0081) → nhãn "emoji đã xóa". Không bao giờ trả `c:<id>` hay UUID ra giao diện.
 */
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
