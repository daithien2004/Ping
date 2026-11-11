'use client';

import type { CustomEmojiDto } from '@ping/shared';
import { ImageOff } from 'lucide-react';
import { profileImageUrl } from '@/features/profile/hooks';
import { customReactionId } from '../../reaction-label';

export function ReactionEmoji({
  emoji,
  emojiName,
  map,
  deletedLabel,
}: {
  emoji: string;
  emojiName?: string;
  map: Map<string, CustomEmojiDto>;
  deletedLabel: string;
}) {
  const id = customReactionId(emoji);
  if (!id) return <>{emoji}</>;
  const resolved = map.get(id);
  if (!resolved) {
    if (emojiName) {
      return (
        <span className="text-xs" data-testid="reaction-deleted-emoji">
          :{emojiName}:
        </span>
      );
    }
    return (
      <ImageOff
        aria-label={deletedLabel}
        role="img"
        className="size-4"
        data-testid="reaction-deleted-emoji"
      />
    );
  }
  return (
    <img
      src={profileImageUrl(resolved.previewUrl || resolved.url)}
      alt={`:${resolved.name}:`}
      title={`:${resolved.name}:`}
      loading="lazy"
      className="h-4 w-4"
    />
  );
}
