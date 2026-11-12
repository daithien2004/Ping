/**
 * Picker nằm sau `dynamic(..., { ssr: false })` nên lần mở đầu phải chờ tải + parse chunk.
 * Hâm nóng trước (lúc app rảnh, khi trỏ chuột/focus vào nút) để lần bấm đầu không còn khoảng trống.
 */
let pending: Promise<unknown> | undefined;

export function preloadEmojiPicker(): Promise<unknown> {
  pending ??= import('./components/emoji-picker');
  return pending;
}
