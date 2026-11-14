/** Chuỗi a..z so sánh theo chuỗi. Trả `null` khi không có chuỗi nằm giữa (vd ab và aba) — caller rebalance. */

const MIN = 96;
const MAX = 123;

export function firstRank(): string {
  return 'm';
}

export function rankBetween(prev: string | undefined, next: string | undefined): string | null {
  let lo = prev;
  let hi = next;
  if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
  if (lo === undefined && hi === undefined) return firstRank();
  if (lo === undefined) return before(hi!);
  if (hi === undefined) return after(lo);

  const len = Math.max(lo.length, hi.length);
  for (let i = 0; i <= len; i += 1) {
    const ca = i < lo.length ? lo.charCodeAt(i) : MIN;
    const cb = i < hi.length ? hi.charCodeAt(i) : MAX;
    if (ca === cb) continue;
    const mid = Math.floor((ca + cb) / 2);
    if (mid > ca && mid < cb) return lo.slice(0, i) + String.fromCharCode(mid);
    const tail = lo.slice(i + 1);
    const grown = after(tail);
    if (grown !== null) return lo.slice(0, i + 1) + grown;
    return null;
  }
  return null;
}

export function after(rank: string): string | null {
  const chars = rank.split('');
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const code = chars[i]!.charCodeAt(0);
    if (code < MAX - 1) {
      chars[i] = String.fromCharCode(code + 1);
      return chars.join('');
    }
  }
  if (rank.length > 0) return rank + 'm';
  return null;
}

function before(rank: string): string | null {
  const chars = rank.split('');
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const code = chars[i]!.charCodeAt(0);
    if (code > MIN + 1) {
      chars[i] = String.fromCharCode(code - 1);
      return chars.join('') + 'm';
    }
  }
  return null;
}
