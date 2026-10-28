import { describe, expect, it } from 'vitest';
import type { CustomEmojiDto } from '@ping/shared';
import {
  customEmojiIdFromToken,
  emojiInsertToken,
  emojiMatchesSearch,
  suggestEmojiName,
} from './emoji-utils';

const emoji = (name: string, id = '3fa85f64-5717-4562-b3fc-2c963f66afa6'): CustomEmojiDto => ({
  id,
  name,
  animated: false,
  url: `/files/${id}`,
  previewUrl: `/files/${id}.thumb`,
  width: 128,
  height: 128,
});

describe('emoji-utils (TG.24)', () => {
  it('emojiInsertToken: token `:ten:<id>` — id là nguồn sự thật', () => {
    expect(emojiInsertToken(emoji('cuoi'))).toBe(':cuoi:3fa85f64-5717-4562-b3fc-2c963f66afa6');
  });

  it('customEmojiIdFromToken: tách đúng id, từ chối token sai hình thức', () => {
    expect(customEmojiIdFromToken(':cuoi:3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(
      '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    );
    expect(customEmojiIdFromToken(':cuoi:khong-phai-uuid')).toBeNull();
    expect(customEmojiIdFromToken(':cuoi:3fa85f64-5717-4562-b3fc-2c963f66afa')).toBeNull(); // thiếu ký tự
    expect(customEmojiIdFromToken(':smile:')).toBeNull(); // shortcode thường
  });

  it('emojiMatchesSearch: tìm không dấu hai chiều (foldVi), khoảng trắng coi như _', () => {
    const khoc = emoji('khoc');
    expect(emojiMatchesSearch(khoc, 'khóc')).toBe(true);
    expect(emojiMatchesSearch(emoji('guong_cuoi'), 'GUONG CUOI')).toBe(true);
    expect(emojiMatchesSearch(khoc, '  khoc  ')).toBe(true);
    expect(emojiMatchesSearch(khoc, 'khong co')).toBe(false);
  });

  it('emojiMatchesSearch: truy vấn rỗng khớp mọi emoji (hiển thị tab hiện tại)', () => {
    expect(emojiMatchesSearch(emoji('x'), '')).toBe(true);
    expect(emojiMatchesSearch(emoji('x'), '   ')).toBe(true);
  });

  it('suggestEmojiName: thường hóa, thay ký tự lạ bằng _, bỏ gạch thừa, trần 32', () => {
    expect(suggestEmojiName('Happy Face!.png')).toBe('happy_face');
    expect(suggestEmojiName('pepe.the.frog.webp')).toBe('pepe_the_frog');
    expect(suggestEmojiName('--Trân--.PNG')).toBe('tran');
    expect(suggestEmojiName('a'.repeat(50) + '.png')).toHaveLength(32);
    expect(suggestEmojiName('!!!.png')).toBe('');
  });
});
