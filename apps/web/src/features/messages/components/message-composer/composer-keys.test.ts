import { describe, expect, it } from 'vitest';
import { isImeKey, isSubmitKey, suggestionKeyAction } from './composer-keys';

describe('suggestionKeyAction', () => {
  it('mũi tên quay vòng hai đầu', () => {
    expect(suggestionKeyAction('ArrowDown', 2, 3)).toEqual({ type: 'move', index: 0 });
    expect(suggestionKeyAction('ArrowUp', 0, 3)).toEqual({ type: 'move', index: 2 });
    expect(suggestionKeyAction('ArrowDown', 0, 3)).toEqual({ type: 'move', index: 1 });
  });
  it('Enter/Tab chấp nhận, Esc bỏ qua gợi ý', () => {
    expect(suggestionKeyAction('Enter', 0, 3)).toEqual({ type: 'accept' });
    expect(suggestionKeyAction('Tab', 1, 3)).toEqual({ type: 'accept' });
    expect(suggestionKeyAction('Escape', 0, 3)).toEqual({ type: 'dismiss' });
  });
  it('phím khác hoặc danh sách rỗng thì null', () => {
    expect(suggestionKeyAction('a', 0, 3)).toBeNull();
    expect(suggestionKeyAction('Enter', 0, 0)).toBeNull();
  });
});

describe('isSubmitKey', () => {
  it('Enter thường là gửi', () => {
    expect(isSubmitKey({ key: 'Enter', shiftKey: false })).toBe(true);
  });
  it('Shift+Enter là xuống dòng', () => {
    expect(isSubmitKey({ key: 'Enter', shiftKey: true })).toBe(false);
  });
  it('phím khác không gửi', () => {
    expect(isSubmitKey({ key: 'a', shiftKey: false })).toBe(false);
  });
});

describe('isImeKey', () => {
  it('đang ghép chữ', () => {
    expect(isImeKey({ isComposing: true, keyCode: 13 })).toBe(true);
  });
  it('Safari: Enter chốt chữ có keyCode 229 dù isComposing=false', () => {
    expect(isImeKey({ isComposing: false, keyCode: 229 })).toBe(true);
  });
  it('phím thường', () => {
    expect(isImeKey({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});
