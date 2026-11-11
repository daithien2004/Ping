import { describe, expect, it } from 'vitest';
import { askErrorKey, parseEvent } from './ask-stream';

describe('parseEvent', () => {
  it('đọc loại sự kiện và dữ liệu JSON', () => {
    expect(parseEvent('event: delta\ndata: {"text":"xin"}')).toEqual({
      type: 'delta',
      data: { text: 'xin' },
    });
  });
  it('thiếu dòng event thì loại là message', () => {
    expect(parseEvent('data: {"a":1}')?.type).toBe('message');
  });
  it('ghép nhiều dòng data trước khi parse', () => {
    expect(parseEvent('event: done\ndata: {"citations":\ndata: ["a"]}')).toEqual({
      type: 'done',
      data: { citations: ['a'] },
    });
  });
  it('khối rỗng, JSON hỏng hoặc không phải object thì null', () => {
    expect(parseEvent('')).toBeNull();
    expect(parseEvent('event: x')).toBeNull();
    expect(parseEvent('data: {hỏng')).toBeNull();
    expect(parseEvent('data: 42')).toBeNull();
    expect(parseEvent('data: null')).toBeNull();
  });
});

describe('askErrorKey', () => {
  it('ánh xạ mã lỗi AI sang khoá dịch', () => {
    expect(askErrorKey('AI_NO_CITATION')).toBe('ask.noCitation');
    expect(askErrorKey('AI_QUOTA_EXCEEDED')).toBe('ask.quotaExceeded');
  });
  it('mã lạ hoặc thiếu thì dùng lỗi chung', () => {
    expect(askErrorKey('NOPE')).toBe('ask.error');
    expect(askErrorKey(undefined)).toBe('ask.error');
  });
});
