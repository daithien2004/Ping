import { rankBetween } from '@ping/shared';

// Rank nằm bên trong 'a'..'z' (không dùng đầu mút) để lần chèn sau còn chỗ hai phía.
export function assignRanks(count: number): string[] {
  if (count <= 0) return [];
  let digits = 1;
  let total = 26;
  while (total < count + 1) {
    digits += 1;
    total *= 26;
  }
  const ranks: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let index = Math.floor(((i + 1) * total) / (count + 1));
    let rank = '';
    for (let d = 0; d < digits; d += 1) {
      rank = String.fromCharCode(97 + (index % 26)) + rank;
      index = Math.floor(index / 26);
    }
    ranks.push(rank);
  }
  return ranks;
}

// So sánh theo mã ký tự trong JS: collation Postgres tùy cấu hình.
export function compareRanks(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// null khi mốc trước đã cạn khoảng; caller rebalance bằng assignRanks.
export function rankAfter(prev: string | undefined): string | null {
  return rankBetween(prev, undefined);
}
