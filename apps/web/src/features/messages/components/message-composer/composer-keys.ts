export type SuggestionKeyAction =
  { type: 'move'; index: number } | { type: 'accept' } | { type: 'dismiss' };

export function suggestionKeyAction(
  key: string,
  index: number,
  count: number,
): SuggestionKeyAction | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return { type: 'move', index: (index + 1) % count };
  if (key === 'ArrowUp') return { type: 'move', index: (index - 1 + count) % count };
  if (key === 'Enter' || key === 'Tab') return { type: 'accept' };
  if (key === 'Escape') return { type: 'dismiss' };
  return null;
}

export const isImeKey = (event: { isComposing: boolean; keyCode: number }): boolean =>
  event.isComposing || event.keyCode === 229;

export const isSubmitKey = (event: { key: string; shiftKey: boolean }): boolean =>
  event.key === 'Enter' && !event.shiftKey;
