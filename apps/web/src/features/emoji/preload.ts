let pending: Promise<unknown> | undefined;

export function preloadEmojiPicker(): Promise<unknown> {
  pending ??= import('./components/emoji-picker');
  return pending;
}
