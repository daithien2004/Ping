import { after, firstRank, rankBetween } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { assignRanks, compareRanks, rankAfter } from './ranks.js';

describe('assignRanks (TG.10 — gán rank cách đều khi rebalance)', () => {
  it('danh sách rỗng → mảng rỗng', () => {
    expect(assignRanks(0)).toEqual([]);
  });

  it('một phần tử → rank nằm giữa bảng chữ cái: còn chỗ chèn ở CẢ hai phía', () => {
    const ranks = assignRanks(1);
    expect(ranks).toEqual(['n']);
    expect(rankBetween(undefined, ranks[0])).not.toBeNull();
    expect(rankBetween(ranks[0], undefined)).not.toBeNull();
  });

  it('nhiều phần tử: tăng nghiêm ngặt, đúng bảng a-z, chèn giữa hai phần tử liền nhau vẫn còn chỗ', () => {
    for (const count of [2, 3, 5, 26, 27, 50]) {
      const ranks = assignRanks(count);
      expect(ranks).toHaveLength(count);
      for (let i = 1; i < count; i += 1) {
        expect(ranks[i]! > ranks[i - 1]!, `count=${count} ranks[${i}]`).toBe(true);
        expect(ranks[i]).toMatch(/^[a-z]+$/);
        // Mục đích của rebalance: sau khi gán lại, chèn giữa mọi cặp liền nhau phải còn chỗ.
        expect(rankBetween(ranks[i - 1], ranks[i]), `count=${count} gap[${i}]`).not.toBeNull();
      }
      expect(rankBetween(undefined, ranks[0]!)).not.toBeNull();
      expect(rankBetween(ranks[count - 1]!, undefined)).not.toBeNull();
    }
  });

  it('trần 50 category / 200 channel (tối đa 2 ký tự): đủ chỗ cho mọi phần tử', () => {
    const ranks = assignRanks(200);
    expect(ranks).toHaveLength(200);
    expect(ranks[199]!.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < 200; i += 1) expect(ranks[i]! > ranks[i - 1]!).toBe(true);
  });
});

describe('compareRanks + rankAfter (TG.10)', () => {
  it('so sánh theo chuỗi: tiền tố nhỏ hơn phần mở rộng', () => {
    expect(compareRanks('a', 'aa')).toBe(-1);
    expect(compareRanks('aa', 'b')).toBe(-1);
    expect(compareRanks('m', 'm')).toBe(0);
    expect(compareRanks('z', 'a')).toBe(1);
  });

  it('rankAfter nối cuối; undefined là mốc đầu; cạn khoảng trả null cho caller rebalance', () => {
    expect(rankAfter(undefined)).toBe(firstRank());
    expect(rankAfter('m')).toBe(after('m'));
    // Chuỗi rỗng (dữ liệu lệch) không còn gì phía trước → null.
    expect(rankAfter('')).toBeNull();
  });
});
