/**
 * Chuẩn hóa chuỗi tìm kiếm: bỏ dấu tiếng Việt để "cuoi" cũng trúng "cười".
 * Module thuần (không DOM/antd) — dùng chung cho tìm kiếm emoji/emoji server/sticker.
 */
export function foldVi(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
