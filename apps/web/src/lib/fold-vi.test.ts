import { describe, expect, it } from 'vitest';
import { foldVi } from './fold-vi';

describe('foldVi', () => {
  it('bỏ dấu tiếng Việt và chuyển đ/Đ thành d/D', () => {
    expect(foldVi('cười')).toBe('cuoi');
    expect(foldVi('Đà Nẵng')).toBe('Da Nang');
  });

  it('chuỗi không dấu giữ nguyên', () => {
    expect(foldVi('hello')).toBe('hello');
  });
});
