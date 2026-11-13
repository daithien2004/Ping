/**
 * Index mục tiêu khi bấm mũi tên trong một lưới nút phẳng (emoji/sticker/GIF picker).
 * `undefined` khi không phải phím mũi tên hoặc đích nằm ngoài lưới — caller giữ nguyên focus.
 */
export function gridArrowKeyIndex(
  key: string,
  index: number,
  total: number,
  columns: number,
): number | undefined {
  const next =
    key === 'ArrowRight'
      ? index + 1
      : key === 'ArrowLeft'
        ? index - 1
        : key === 'ArrowDown'
          ? index + columns
          : key === 'ArrowUp'
            ? index - columns
            : undefined;
  return next !== undefined && next >= 0 && next < total ? next : undefined;
}
