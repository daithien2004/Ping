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
