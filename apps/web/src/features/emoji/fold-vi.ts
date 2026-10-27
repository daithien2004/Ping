/**
 * Chuẩn hóa chuỗi tìm kiếm: bỏ dấu tiếng Việt để "cuoi" cũng trúng "cười".
 * Module thuần (không DOM/antd) để tái dùng và test ở môi trường node — picker chỉ import lại.
 */
export function foldVi(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
