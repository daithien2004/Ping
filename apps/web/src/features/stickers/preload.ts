/** Hâm nóng chunk picker sticker — cùng cơ chế với `preloadEmojiPicker`. */
let pending: Promise<unknown> | undefined;

export function preloadStickerPicker(): Promise<unknown> {
  pending ??= import('./components/sticker-picker');
  return pending;
}
