/** Hai chữ cái đầu của tên, dùng cho avatar khi chưa có ảnh. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
