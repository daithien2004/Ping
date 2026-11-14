import type { CustomEmojiDto } from '@ping/shared';
import type { KeyboardEvent } from 'react';
import { useTranslations } from 'use-intl';
import { profileImageUrl } from '@/features/profile/hooks';

export function CustomEmojiButton({
  emoji,
  onPick,
  onHover,
  onKeyDown,
}: {
  emoji: CustomEmojiDto;
  onPick: (emoji: CustomEmojiDto) => void;
  onHover: (hover: { image: string | undefined; label: string }) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const t = useTranslations('emoji');
  const hover = () =>
    onHover({ image: profileImageUrl(emoji.previewUrl || emoji.url), label: `:${emoji.name}:` });

  return (
    <button
      type="button"
      role="gridcell"
      title={`:${emoji.name}:`}
      aria-label={t('pickCustomEmoji', { name: emoji.name })}
      onClick={() => onPick(emoji)}
      onKeyDown={onKeyDown}
      onMouseEnter={hover}
      onFocus={hover}
      data-testid="custom-emoji-option"
      className="grid size-9 place-items-center rounded-md transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      <img
        src={profileImageUrl(emoji.previewUrl || emoji.url)}
        alt=""
        loading="lazy"
        className="size-7 object-contain"
      />
    </button>
  );
}
