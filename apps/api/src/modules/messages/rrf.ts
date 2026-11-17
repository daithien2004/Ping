/** Reciprocal Rank Fusion (Cormack 2009): gộp nhiều danh sách xếp hạng mà không cần chuẩn hóa điểm số khác thang đo. */
export function reciprocalRankFusion(lists: readonly (readonly string[])[], k = 60): string[] {
  const score = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1)));
  }
  return [...score].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
