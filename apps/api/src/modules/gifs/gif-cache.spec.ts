import { describe, expect, it } from 'vitest';
import type { GifDto } from '@ping/shared';
import { GifCache } from './gif-cache.js';

const gif: GifDto = {
  id: '1',
  url: 'https://media.tenor.com/abc/AAAAC/hello.gif',
  width: 498,
  height: 278,
  provider: 'tenor',
};

describe('GifCache (TG.25, ADR-0069)', () => {
  it('trả lại giá trị trong TTL và hết hạn đúng hạn', () => {
    let now = 1_000;
    const cache = new GifCache(5_000, 200, () => now);

    cache.set('search:mèo:24', [gif]);
    expect(cache.get('search:mèo:24')).toEqual([gif]);
    now += 4_999;
    expect(cache.get('search:mèo:24')).toEqual([gif]);
    now += 1; // quá 5 giây
    expect(cache.get('search:mèo:24')).toBeUndefined();
  });

  it('hết chỗ thì xóa entry cũ nhất (FIFO)', () => {
    const now = 0;
    const cache = new GifCache(60_000, 2, () => now);

    cache.set('a', [gif]);
    cache.set('b', [gif]);
    cache.set('c', [gif]); // 'a' là cũ nhất → bị thay

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toEqual([gif]);
    expect(cache.get('c')).toEqual([gif]);
  });

  it('khóa quá dài bị trim nhưng get/set vẫn khớp nhau', () => {
    const cache = new GifCache();
    const longKey = 'x'.repeat(600); // vượt trần 512

    cache.set(longKey, [gif]);

    expect(cache.get(longKey)).toEqual([gif]);
    // 511 ký tự 'x' khác khóa đã trim (512 ký tự 'x') → trượt là đúng.
    expect(cache.get('x'.repeat(511))).toBeUndefined();
  });
});
