import { describe, expect, it } from 'vitest';
import { gridArrowKeyIndex } from './grid-arrow-key-index';

describe('gridArrowKeyIndex', () => {
  it('di chuyển theo 4 hướng mũi tên trong lưới 3 cột, 9 ô', () => {
    expect(gridArrowKeyIndex('ArrowRight', 4, 9, 3)).toBe(5);
    expect(gridArrowKeyIndex('ArrowLeft', 4, 9, 3)).toBe(3);
    expect(gridArrowKeyIndex('ArrowDown', 4, 9, 3)).toBe(7);
    expect(gridArrowKeyIndex('ArrowUp', 4, 9, 3)).toBe(1);
  });

  it('ra ngoài lưới (âm hoặc vượt tổng số ô) trả undefined, không bọc vòng', () => {
    expect(gridArrowKeyIndex('ArrowLeft', 0, 9, 3)).toBeUndefined();
    expect(gridArrowKeyIndex('ArrowUp', 1, 9, 3)).toBeUndefined();
    expect(gridArrowKeyIndex('ArrowRight', 8, 9, 3)).toBeUndefined();
    expect(gridArrowKeyIndex('ArrowDown', 7, 9, 3)).toBeUndefined();
  });

  it('phím khác mũi tên (vd Tab, Enter) trả undefined — caller không preventDefault', () => {
    expect(gridArrowKeyIndex('Tab', 4, 9, 3)).toBeUndefined();
    expect(gridArrowKeyIndex('Enter', 4, 9, 3)).toBeUndefined();
  });
});
