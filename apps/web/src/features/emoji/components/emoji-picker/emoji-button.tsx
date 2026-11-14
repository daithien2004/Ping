import type { KeyboardEvent } from 'react';
import { useTranslations } from 'use-intl';
import type { EmojiEntry } from '../../data';

export function EmojiButton({
  entry,
  onPick,
  onHover,
  onKeyDown,
}: {
  entry: EmojiEntry;
  onPick: (entry: EmojiEntry) => void;
  onHover: (hover: { glyph: string; label: string }) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const t = useTranslations('emoji');
  const hover = () => onHover({ glyph: entry.unicode, label: `:${entry.shortcode}:` });

  return (
    <button
      type="button"
      role="gridcell"
      title={`:${entry.shortcode}:`}
      aria-label={t('pickEmoji', { name: entry.keywords[0]! })}
      onClick={() => onPick(entry)}
      onKeyDown={onKeyDown}
      onMouseEnter={hover}
      onFocus={hover}
      className="grid size-9 place-items-center rounded-md text-xl leading-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      {entry.unicode}
    </button>
  );
}
