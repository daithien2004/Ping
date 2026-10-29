/**
 * TG.10: thứ tự lexorank — chuỗi ký tự 'a'..'z' so sánh theo chuỗi (tiền tố nhỏ hơn phần mở
 * rộng: 'a' < 'aa'). Chèn giữa hai mốc chỉ đụng MỘT hàng (không đánh số lại hàng loạt).
 *
 * MỘT SỐ cặp mốc KHÔNG có chuỗi nào nằm giữa (ví dụ 'ab' và 'aba' — mọi chuỗi bắt đầu 'ab'
 * đều ≥ 'aba'): khi đó trả `null` — caller rebalance phần đó (gán lại rank đều cho cả nhóm,
 * chuyện hiếm gặp vì rank sinh ra luôn chừa khoảng cách).
 */

const MIN = 96; // dưới 'a' — "ký tự" của chuỗi đã hết (chuỗi ngắn hơn = nhỏ hơn)
const MAX = 123; // trên 'z' — "ký tự" của chuỗi đã hết phía bên kia

/** Mốc đầu tiên khi danh sách trống: giữa bảng chữ cái để chừa hai phía. */
export function firstRank(): string {
  return 'm';
}

/**
 * Rank nằm nghiêm ngặt giữa `prev` và `next` (so sánh chuỗi; undefined = không có mốc đó —
 * đầu/cuối danh sách). Trả `null` khi hai mốc sát nhau không còn khoảng (caller rebalance).
 */
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
    // Không còn chỗ ở vị trí này (cb = ca + 1): đi SAT chuỗi lo rồi kéo dài phần đuôi lo
    // (afterRank lo luôn > lo, và vì chữ tại i trùng lo < hi nên toàn bộ vẫn < hi).
    // Chuỗi lo đã hết (hoặc đuôi toàn 'z') mà hi vẫn "sát" → không có gì nằm giữa.
    const tail = lo.slice(i + 1);
    const grown = after(tail);
    if (grown !== null) return lo.slice(0, i + 1) + grown;
    return null;
  }
  return null; // hai mốc bằng nhau — caller rebalance
}

/** Rank LỚN HƠN nghiêm ngặt `rank` (chèn sau mốc cuối danh sách); null khi không còn chỗ. */
export function after(rank: string): string | null {
  const chars = rank.split('');
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const code = chars[i]!.charCodeAt(0);
    if (code < MAX - 1) {
      chars[i] = String.fromCharCode(code + 1);
      return chars.join('');
    }
  }
  // Đuôi toàn 'z': kéo dài — 'z' + 'm' > 'z' và vẫn < mốc "vô cực".
  if (rank.length > 0) return rank + 'm';
  return null;
}

/** Rank NHỎ HƠN nghiêm ngặt `rank` (chèn trước mốc đầu danh sách); null khi không còn chỗ. */
function before(rank: string): string | null {
  const chars = rank.split('');
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const code = chars[i]!.charCodeAt(0);
    if (code > MIN + 1) {
      chars[i] = String.fromCharCode(code - 1);
      return chars.join('') + 'm';
    }
  }
  // Đuôi toàn 'a' (ví dụ 'aa...a'): không có chuỗi nào nhỏ hơn mà lớn hơn rỗng — rebalance.
  return null;
}
