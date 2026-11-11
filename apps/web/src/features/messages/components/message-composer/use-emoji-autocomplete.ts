'use client';

import { customEmojiToken } from '@ping/shared';
import { useState, type KeyboardEvent } from 'react';
import { useEmojiSuggestions } from '@/features/emoji/hooks';
import { suggestionKeyAction } from './composer-keys';
import { extractFragment, replaceFragment } from './emoji-fragment';

export function useEmojiAutocomplete(
  draft: string,
  setDraft: (value: string) => void,
  serverId?: string,
) {
  const fragment = extractFragment(draft);
  const suggestions = useEmojiSuggestions(fragment, serverId);
  const [index, setIndex] = useState(0);
  const open = suggestions.length > 0 && fragment !== null;

  function accept(at = index) {
    const suggestion = suggestions[at];
    if (!suggestion || fragment === null) return;
    const insert = suggestion.id
      ? customEmojiToken(suggestion.shortcode, suggestion.id)
      : `:${suggestion.shortcode}:`;
    setDraft(replaceFragment(draft, fragment, insert));
    setIndex(0);
  }

  function dismiss() {
    if (fragment === null) return;
    setDraft(replaceFragment(draft, fragment));
    setIndex(0);
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open) return false;
    const action = suggestionKeyAction(event.key, index, suggestions.length);
    if (!action) return false;
    event.preventDefault();
    switch (action.type) {
      case 'move':
        setIndex(action.index);
        break;
      case 'accept':
        accept();
        break;
      case 'dismiss':
        dismiss();
        break;
    }
    return true;
  }

  return { suggestions, index, open, accept, handleKey, reset: () => setIndex(0) };
}
