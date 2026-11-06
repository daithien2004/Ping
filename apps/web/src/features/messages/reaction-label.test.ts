import { describe, expect, it } from 'vitest';
import { customReactionId, reactionLabel } from './reaction-label';

const ID = '01a1b017-9dec-7381-886a-28c02713f875';
const DELETED = 'emoji đã xóa';

describe('customReactionId', () => {
  it('lấy id từ token c:<id>, bỏ qua emoji Unicode và token sai hình thức', () => {
    expect(customReactionId(`c:${ID}`)).toBe(ID);
    expect(customReactionId('👍')).toBeNull();
    expect(customReactionId('c:not-a-uuid')).toBeNull();
  });
});

describe('reactionLabel', () => {
  it('giữ nguyên emoji Unicode', () => {
    expect(reactionLabel({ emoji: '👍', deletedLabel: DELETED })).toBe('👍');
  });

  it('ưu tiên tên trong cache server, rồi tên API trả khi emoji đã xóa', () => {
    expect(
      reactionLabel({
        emoji: `c:${ID}`,
        resolvedName: 'parrot',
        emojiName: 'cu',
        deletedLabel: DELETED,
      }),
    ).toBe(':parrot:');
    expect(
      reactionLabel({ emoji: `c:${ID}`, emojiName: 'test_emoji', deletedLabel: DELETED }),
    ).toBe(':test_emoji:');
  });

  it('không có tên thì dùng nhãn "đã xóa" và không lộ id', () => {
    const label = reactionLabel({ emoji: `c:${ID}`, deletedLabel: DELETED });
    expect(label).toBe(DELETED);
    expect(label).not.toContain(ID.slice(-8));
  });
});
