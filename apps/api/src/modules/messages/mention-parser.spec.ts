import { Limits } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { extractMentionTokens } from './mention-parser.js';

describe('extractMentionTokens (T4.1)', () => {
  it('tách @username đơn giản', () => {
    expect(extractMentionTokens('chào @bob nhé')).toEqual({
      everyone: false,
      names: ['bob'],
    });
  });

  it('@everyone thành cờ riêng, không nằm trong names', () => {
    expect(extractMentionTokens('@everyone họp giờ')).toEqual({
      everyone: true,
      names: [],
    });
  });

  it('email không phải mention (a@b.com)', () => {
    expect(extractMentionTokens('gửi cho alice@example.com nhé')).toEqual({
      everyone: false,
      names: [],
    });
  });

  it('@@ và @ kề chữ cái không match', () => {
    expect(extractMentionTokens('@@bob x@alice')).toEqual({ everyone: false, names: [] });
  });

  it('dấu câu kề token không vỡ token', () => {
    expect(extractMentionTokens('@bob, @carol!')).toEqual({
      everyone: false,
      names: ['bob', 'carol'],
    });
  });

  it('token quá ngắn (<3) không match', () => {
    expect(extractMentionTokens('@ab @bo')).toEqual({ everyone: false, names: [] });
  });

  it('token dài hơn 32 ký tự bị loại cả chuỗi (không match một phần)', () => {
    const long = 'a'.repeat(33);
    expect(extractMentionTokens(`@${long} @bob`)).toEqual({
      everyone: false,
      names: ['bob'],
    });
  });

  it('trùng token chỉ tính một lần, giữ thứ tự xuất hiện', () => {
    expect(extractMentionTokens('@bob @carol @bob @carol')).toEqual({
      everyone: false,
      names: ['bob', 'carol'],
    });
  });

  it('token chứa dấu chấm/gạch như username vẫn nhận', () => {
    expect(extractMentionTokens('hey @bob.tran_99 ok')).toEqual({
      everyone: false,
      names: ['bob.tran_99'],
    });
  });

  it('giới hạn số mention khác nhau (vượt phần sau bị bỏ)', () => {
    const content = Array.from({ length: Limits.MENTIONS_PER_MESSAGE + 5 }, (_, i) => `@user${i}`)
      .concat(['@everyone'])
      .join(' ');
    const result = extractMentionTokens(content);
    // 20 mention đầu (kể cả nếu trong đó có @everyone) — ở đây 20 token đầu là user,
    // nên @everyone nằm ngoài trần và bị bỏ.
    expect(result.names).toHaveLength(Limits.MENTIONS_PER_MESSAGE);
    expect(result.everyone).toBe(false);
  });

  it('@everyone tính vào trần mention', () => {
    const content = '@everyone '.concat(
      Array.from({ length: Limits.MENTIONS_PER_MESSAGE }, (_, i) => `@user${i}`).join(' '),
    );
    const result = extractMentionTokens(content);
    expect(result.everyone).toBe(true);
    expect(result.names).toHaveLength(Limits.MENTIONS_PER_MESSAGE - 1);
  });
});
