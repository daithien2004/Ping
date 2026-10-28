import { ErrorCodes } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import {
  GIF_RECENT_MAX,
  isGifProviderUnavailable,
  parseRecentGifs,
  pushRecentGif,
  recentGifsKey,
  type RecentGif,
} from './gif-utils';

const gif = (id: string): RecentGif => ({
  id,
  url: `https://media.tenor.com/${id}.gif`,
  width: 200,
  height: 150,
});

describe('gif-utils (TG.25)', () => {
  it('pushRecentGif: đưa lên đầu, khử trùng lặp theo id, giữ trần 24', () => {
    let recent: RecentGif[] = [];
    for (let i = 0; i < 30; i += 1) recent = pushRecentGif(recent, gif(`g${i}`));
    expect(recent).toHaveLength(GIF_RECENT_MAX);
    expect(recent[0]?.id).toBe('g29');
    expect(recent.at(-1)?.id).toBe('g6');
    // Chọn lại GIF đã có: đưa lên đầu chứ không tạo bản sao (so sánh theo id).
    const again = pushRecentGif(recent, gif('g29'));
    expect(again.map((item) => item.id)).toEqual(recent.map((item) => item.id));
    const repositioned = pushRecentGif(recent, gif('g10'));
    expect(repositioned[0]?.id).toBe('g10');
    expect(repositioned.filter((item) => item.id === 'g10')).toHaveLength(1);
  });

  it('recentGifsKey: khóa localStorage chứa userId (dữ liệu gần đây là theo user)', () => {
    expect(recentGifsKey('u1')).toBe('ping.gif-recent.u1');
    expect(recentGifsKey('u2')).not.toBe(recentGifsKey('u1'));
  });

  it('parseRecentGifs: chỉ giữ mục đủ trường, URL https và kích thước nguyên dương', () => {
    const valid = gif('ok');
    expect(
      parseRecentGifs([
        valid,
        null,
        'g1',
        {},
        { id: 'x', url: 'http://media.tenor.com/a.gif', width: 10, height: 10 }, // không phải https
        { id: '', url: 'https://media.tenor.com/a.gif', width: 10, height: 10 }, // id rỗng
        { id: 'x', url: 'https://media.tenor.com/a.gif', width: 0, height: 10 }, // kích thước 0
        { id: 'x', url: 'https://media.tenor.com/a.gif', width: 1.5, height: 10 }, // không nguyên
        { id: 'x', url: 'https://media.tenor.com/a.gif', width: 10 }, // thiếu height
      ]),
    ).toEqual([valid]);
    expect(parseRecentGifs('không phải mảng')).toEqual([]);
    expect(parseRecentGifs(undefined)).toEqual([]);
  });

  it('isGifProviderUnavailable: chỉ trúng 503 GIF_PROVIDER_UNAVAILABLE', () => {
    expect(
      isGifProviderUnavailable(
        new ApiError(503, ErrorCodes.GIF_PROVIDER_UNAVAILABLE, 'provider unavailable'),
      ),
    ).toBe(true);
    expect(
      isGifProviderUnavailable(new ApiError(503, ErrorCodes.SERVICE_UNAVAILABLE, 'down')),
    ).toBe(false);
    expect(isGifProviderUnavailable(new ApiError(400, ErrorCodes.BAD_REQUEST, 'bad'))).toBe(false);
    expect(isGifProviderUnavailable(new Error('lỗi lạ'))).toBe(false);
    expect(isGifProviderUnavailable(undefined)).toBe(false);
  });
});
