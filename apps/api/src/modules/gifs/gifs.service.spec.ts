import { ServiceUnavailableException } from '@nestjs/common';
import { ErrorCodes, type GifDto } from '@ping/shared';
import { describe, expect, it, vi } from 'vitest';
import { GifCache } from './gif-cache.js';
import { GifProviderUnavailableError, type GifProvider } from './gif-provider.port.js';
import { GifRateLimiter } from './gif-rate-limiter.js';
import { GifsService } from './gifs.service.js';

const gif: GifDto = {
  id: '1',
  url: 'https://media.tenor.com/abc/AAAAC/hello.gif',
  width: 498,
  height: 278,
  provider: 'tenor',
};

/** Rate limiter giả: đếm lượt consume, không đụng Redis trong unit test. */
function stubLimiter() {
  return { consume: vi.fn(async () => undefined) } as unknown as GifRateLimiter;
}

describe('GifsService (TG.25, ADR-0069)', () => {
  it('cache hit: hai lần tìm cùng (q, limit) chỉ gọi provider MỘT lần', async () => {
    const provider: GifProvider = {
      search: vi.fn(async () => [gif]),
      trending: vi.fn(async () => [gif]),
    };
    const service = new GifsService(provider, new GifCache(), stubLimiter());

    const first = await service.search('user-1', 'mèo', 24);
    const second = await service.search('user-2', 'mèo', 24);

    expect(second).toEqual(first);
    expect(provider.search).toHaveBeenCalledTimes(1);
    // Khác limit là khóa cache khác → vẫn phải gọi provider.
    await service.search('user-1', 'mèo', 10);
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it('trending dùng khóa riêng: search không làm ấm cache trending', async () => {
    const provider: GifProvider = {
      search: vi.fn(async () => [gif]),
      trending: vi.fn(async () => [gif]),
    };
    const service = new GifsService(provider, new GifCache(), stubLimiter());

    await service.search('user-1', 'mèo', 24);
    await service.trending('user-1', 24);

    expect(provider.trending).toHaveBeenCalledTimes(1);
  });

  it('provider không dùng được → 503 GIF_PROVIDER_UNAVAILABLE', async () => {
    const provider: GifProvider = {
      search: vi.fn(async () => {
        throw new GifProviderUnavailableError('Thiếu TENOR_API_KEY');
      }),
      trending: vi.fn(async () => {
        throw new GifProviderUnavailableError('Tenor trả về HTTP 429');
      }),
    };
    const service = new GifsService(provider, new GifCache(), stubLimiter());

    const searchError = await service.search('user-1', 'mèo', 24).catch((cause) => cause);
    expect(searchError).toBeInstanceOf(ServiceUnavailableException);
    expect((searchError as ServiceUnavailableException).getResponse()).toMatchObject({
      code: ErrorCodes.GIF_PROVIDER_UNAVAILABLE,
    });

    const trendingError = await service.trending('user-1', 24).catch((cause) => cause);
    expect(trendingError).toBeInstanceOf(ServiceUnavailableException);
    expect((trendingError as ServiceUnavailableException).getResponse()).toMatchObject({
      code: ErrorCodes.GIF_PROVIDER_UNAVAILABLE,
    });
    // Lỗi không được cache: lần gọi sau vẫn thử lại provider (vẫn 503).
    const retry = await service.search('user-1', 'mèo', 24).catch((cause) => cause);
    expect(retry).toBeInstanceOf(ServiceUnavailableException);
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it('mỗi lời gọi đều đi qua rate limiter theo user', async () => {
    const provider: GifProvider = {
      search: vi.fn(async () => [gif]),
      trending: vi.fn(async () => [gif]),
    };
    const limiter = stubLimiter();
    const service = new GifsService(provider, new GifCache(), limiter);

    await service.search('user-1', 'mèo', 24);
    await service.trending('user-1', 24);

    expect(limiter.consume).toHaveBeenCalledTimes(2);
    expect(limiter.consume).toHaveBeenCalledWith('user-1');
  });
});
