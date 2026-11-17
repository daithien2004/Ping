import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from './rrf.js';

describe('reciprocalRankFusion', () => {
  it('mục có ở cả hai danh sách lên đầu, đồng điểm giữ thứ tự xuất hiện', () => {
    expect(
      reciprocalRankFusion([
        ['a', 'b', 'c'],
        ['c', 'd'],
      ]),
    ).toEqual(['c', 'a', 'b', 'd']);
  });

  it('một danh sách rỗng thì giữ nguyên thứ tự danh sách còn lại', () => {
    expect(reciprocalRankFusion([[], ['x', 'y']])).toEqual(['x', 'y']);
  });

  it('không có danh sách nào thì rỗng', () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });
});
