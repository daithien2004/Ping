'use client';

import { useTranslations } from 'use-intl';
import type { EmojiSuggestion } from '@/features/emoji/hooks';
import { profileImageUrl } from '@/features/profile/hooks';

export function EmojiSuggestionList({
  suggestions,
  activeIndex,
  onPick,
}: {
  suggestions: EmojiSuggestion[];
  activeIndex: number;
  onPick: (index: number) => void;
}) {
  const te = useTranslations('emoji');
  return (
    <ul
      role="listbox"
      aria-label={te('suggestionsLabel')}
      className="mb-1 flex flex-col gap-0.5 rounded-lg border bg-popover p-1 shadow-panel"
      data-testid="emoji-suggestions"
    >
      {suggestions.map((entry, index) => {
        const active = index === activeIndex;
        return (
          <li key={entry.id ?? entry.shortcode}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onPick(index)}
              className={`focus-ring flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors ${
                active ? 'bg-accent' : 'hover:bg-accent/60'
              }`}
            >
              {entry.imageUrl ? (
                <img
                  src={profileImageUrl(entry.imageUrl)}
                  alt=""
                  loading="lazy"
                  className="h-5 w-5 object-contain"
                />
              ) : (
                <span className="text-lg leading-none">{entry.unicode}</span>
              )}
              <code
                className={`text-xs ${active ? 'text-accent-foreground' : 'text-muted-foreground'}`}
              >
                :{entry.shortcode}:
              </code>
              {entry.keywords[0] && (
                <span
                  className={`truncate text-xs ${
                    active ? 'text-accent-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {entry.keywords[0]}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
