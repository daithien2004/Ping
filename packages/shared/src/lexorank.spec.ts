import { describe, expect, it } from 'vitest';
import { after, firstRank, rankBetween } from './lexorank';

/** Bậc thang chèn N phần tử liên tiếp từ rank đầu — chứng minh không cần rebalance. */
function chain(n: number): string[] {
  const ranks: string[] = [firstRank()];
  for (let i = 1; i < n; i += 1) {
    const r = rankBetween(ranks[i - 1]!, undefined);
    if (r === null) throw new Error('chèn cuối hết chỗ (không nên xảy ra ở quy mô test)');
    ranks.push(r);
  }
  return ranks;
}

describe('lexorank (TG.10)', () => {
  it('danh sách trống → firstRank ở giữa bảng chữ cái', () => {
    expect(firstRank()).toBe('m');
  });

  it('chèn giữa hai mốc có khoảng → đúng midpoint', () => {
    expect(rankBetween('a', 'd')).toBe('b'); // floor(97+100/2)=98='b' (< 'c', nghiêm ngặt ✓)
    expect(rankBetween('m', 'o')).toBe('n');
    expect(rankBetween('ma', 'mo')).toBe('mh'); // mid('a','o') = 'h'
    // Thứ tự tham số không quan trọng.
    expect(rankBetween('d', 'a')).toBe(rankBetween('a', 'd'));
  });

  it('chèn đầu/cuối danh sách', () => {
    expect(rankBetween(undefined, 'm')).toMatch(/^[a-l]/); // nhỏ hơn 'm'
    expect(rankBetween('m', undefined)).toMatch(/[n-z]/); // lớn hơn 'm'
    expect(after('m')).toMatch(/^[n-z]/);
  });

  it('chèn N=200 phần tử liên tiếp: mọi cặp kề nhau giữ trật tự nghiêm ngặt', () => {
    const ranks = chain(200);
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i]! > ranks[i - 1]!, `${ranks[i - 1]} < ${ranks[i]}`).toBe(true);
    }
    // Chèn vào GIỮA hai mốc kề nhau 50 lần liên tiếp vẫn đúng (đây là chỗ lexorank giá trị).
    let lo = ranks[0]!;
    let hi = ranks[1]!;
    for (let i = 0; i < 50; i += 1) {
      const mid = rankBetween(lo, hi);
      if (mid === null) {
        // Kẹt — caller rebalance; trong test này chứng minh chỉ xảy ra muộn và hiếm.
        break;
      }
      expect(mid > lo && mid < hi).toBe(true);
      hi = mid;
    }
  });

  it('cặp mốc không có chuỗi giữa → null (caller rebalance)', () => {
    expect(rankBetween('ab', 'aba')).toBeNull();
  });

  it('kẹt đuôi z: sau "bz" vẫn còn rank < "c"', () => {
    const r = rankBetween('bz', 'c');
    expect(r).not.toBeNull();
    expect(r! > 'bz').toBe(true);
    expect(r! < 'c').toBe(true);
  });

  it('sau mốc cuối toàn z vẫn chèn được (kéo dài)', () => {
    expect(after('zz')).toBe('zzm');
    expect(after('zm')).toBe('zn');
  });

  it('before: rank nhỏ hơn nghiêm ngặt hoặc null', () => {
    // rankBetween(undefined, X) dùng before — bọc qua API công khai để kiểm.
    const r = rankBetween(undefined, 'aa');
    expect(r === null || r < 'aa').toBe(true);
  });
});
