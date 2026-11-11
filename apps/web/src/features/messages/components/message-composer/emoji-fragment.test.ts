import { describe, expect, it } from 'vitest';
import { extractFragment, replaceFragment } from './emoji-fragment';

describe('extractFragment', () => {
  it('lấy shortcode đang gõ ở cuối nháp', () => {
    expect(extractFragment('xin :cuo')).toBe('cuo');
    expect(extractFragment(':a1_b')).toBe('a1_b');
  });
  it('null khi không có fragment', () => {
    expect(extractFragment('xin chào')).toBeNull();
    expect(extractFragment('xin :cuoi: ')).toBeNull();
    expect(extractFragment(':')).toBeNull();
  });
});

describe('replaceFragment', () => {
  it('bỏ `:fragment` ở cuối (Esc)', () => {
    expect(replaceFragment('xin :smi', 'smi')).toBe('xin ');
  });
  it('thay `:fragment` bằng đoạn chèn (chấp nhận gợi ý)', () => {
    expect(replaceFragment('xin :smi', 'smi', ':smile:')).toBe('xin :smile:');
  });
});
