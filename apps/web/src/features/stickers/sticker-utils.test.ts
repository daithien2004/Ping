import type { StickerDto } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { pushRecentSticker, stickerMatchesSearch } from './sticker-utils';

const sticker = (name: string, tags: string[] = []): StickerDto => ({
  id: `s-${name}`,
  packId: 'p1',
  name,
  tags,
  url: '/u',
  previewUrl: '/p',
  width: 128,
  height: 128,
});

describe('sticker-utils (TG.22)', () => {
  it('tìm không dấu trúng tên và thẻ, bỏ qua khoảng trắng thừa', () => {
    const parrot = sticker('người nhắm', ['meme', 'cười']);
    expect(stickerMatchesSearch(parrot, 'nguoi nham')).toBe(true);
    expect(stickerMatchesSearch(parrot, 'CUOI')).toBe(true);
    expect(stickerMatchesSearch(parrot, '  meme  ')).toBe(true);
    expect(stickerMatchesSearch(parrot, 'không có')).toBe(false);
  });

  it('truy vấn rỗng khớp mọi sticker (hiển thị tab hiện tại)', () => {
    expect(stickerMatchesSearch(sticker('x'), '')).toBe(true);
    expect(stickerMatchesSearch(sticker('x'), '   ')).toBe(true);
  });

  it('pushRecentSticker: đưa lên đầu, khử trùng lặp, giữ trần 24', () => {
    let recent: string[] = [];
    for (let i = 0; i < 30; i += 1) recent = pushRecentSticker(recent, `s${i}`);
    expect(recent).toHaveLength(24);
    expect(recent[0]).toBe('s29');
    expect(recent.at(-1)).toBe('s6');
    const again = pushRecentSticker(recent, 's29');
    expect(again).toEqual(recent); // chọn lại không tạo bản sao
    const repositioned = pushRecentSticker(recent, 's10');
    expect(repositioned[0]).toBe('s10');
    expect(repositioned.filter((id) => id === 's10')).toHaveLength(1);
  });
});
