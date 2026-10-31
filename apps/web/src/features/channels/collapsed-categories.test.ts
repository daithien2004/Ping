import { describe, expect, it } from 'vitest';
import {
  collapsedKey,
  readCollapsedCategories,
  toggleCollapsed,
  writeCollapsedCategories,
} from './collapsed-categories';

describe('collapsed-categories', () => {
  it('key tách theo user + server', () => {
    expect(collapsedKey('u1', 's1')).toBe('ping.cat-collapsed.u1.s1');
    expect(collapsedKey('u1', 's2')).not.toBe(collapsedKey('u1', 's1'));
  });

  it('toggle thêm rồi bỏ đúng một category', () => {
    expect(toggleCollapsed([], 'c1')).toEqual(['c1']);
    expect(toggleCollapsed(['c1', 'c2'], 'c1')).toEqual(['c2']);
    // Toggle lần nữa không nhân đôi, bỏ không trúng thì nguyên vẹn.
    expect(toggleCollapsed(['c2'], 'c1')).toEqual(['c2', 'c1']);
  });

  it('đọc khi không có window (SSR) trả rỗng, không văng', () => {
    expect(readCollapsedCategories('u1', 's1')).toEqual([]);
    expect(() => writeCollapsedCategories('u1', 's1', ['c1'])).not.toThrow();
  });
});
