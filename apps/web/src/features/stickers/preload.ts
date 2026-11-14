let pending: Promise<unknown> | undefined;

export function preloadStickerPicker(): Promise<unknown> {
  pending ??= import('./components/sticker-picker');
  return pending;
}
