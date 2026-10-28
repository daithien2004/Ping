import { describe, expect, it, vi } from 'vitest';
import { GifProviderUnavailableError } from './gif-provider.port.js';
import { TenorProvider } from './tenor.provider.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Body Tenor v2 tối giản: hai kết quả, một cái thiếu biến thể `gif` để kiểm nhánh bỏ qua. */
const tenorBody = {
  results: [
    {
      id: '1234567890',
      media_formats: {
        gif: { url: 'https://media.tenor.com/abc/AAAAC/hello.gif', dims: [498, 278] },
        tinygif: { url: 'https://media.tenor.com/abc/AAAC/tiny.gif', dims: [220, 123] },
      },
    },
    {
      id: '9876543210',
      media_formats: {
        gif: { url: 'https://media.tenor.com/def/BBBB/world.gif', dims: [640, 360] },
      },
    },
    { id: 'broken' }, // thiếu media_formats → bị bỏ, không làm sập trang
  ],
};

describe('TenorProvider (TG.25, ADR-0069)', () => {
  it('map kết quả Tenor sang GifDto, lấy biến thể `gif` (bản đủ lớn)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(tenorBody));
    const provider = new TenorProvider('test-key', fetchImpl);

    const gifs = await provider.search('mèo', 24);

    expect(gifs).toEqual([
      {
        id: '1234567890',
        url: 'https://media.tenor.com/abc/AAAAC/hello.gif',
        width: 498,
        height: 278,
        provider: 'tenor',
      },
      {
        id: '9876543210',
        url: 'https://media.tenor.com/def/BBBB/world.gif',
        width: 640,
        height: 360,
        provider: 'tenor',
      },
    ]);
  });

  it('search gọi đúng endpoint v2, contentfilter=high ghim cứng và media_filter=gif', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ results: [] }));
    const provider = new TenorProvider('test-key', fetchImpl);

    await provider.search('con mèo & chó', 10);

    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      'https://tenor.googleapis.com/v2/search?q=con%20m%C3%A8o%20%26%20ch%C3%B3&key=test-key' +
        '&limit=10&contentfilter=high&media_filter=gif',
    );
  });

  it('trending gọi endpoint `featured` với cùng tham số an toàn', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ results: [] }));
    const provider = new TenorProvider('test-key', fetchImpl);

    await provider.trending(24);

    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('https://tenor.googleapis.com/v2/featured?');
    expect(url).toContain('limit=24');
    expect(url).toContain('contentfilter=high&media_filter=gif');
  });

  it('ném GifProviderUnavailableError khi thiếu key, không gọi mạng', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = new TenorProvider(undefined, fetchImpl);

    await expect(provider.search('mèo', 24)).rejects.toBeInstanceOf(GifProviderUnavailableError);
    await expect(provider.trending(24)).rejects.toBeInstanceOf(GifProviderUnavailableError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('lỗi mạng, HTTP lỗi và JSON hỏng đều quy về GifProviderUnavailableError', async () => {
    const down = new TenorProvider(
      'k',
      vi.fn<typeof fetch>(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const httpError = new TenorProvider(
      'k',
      vi.fn<typeof fetch>(async () => jsonResponse({ error: 'quota' }, 429)),
    );
    const badJson = new TenorProvider(
      'k',
      vi.fn<typeof fetch>(async () => new Response('<html>not json</html>', { status: 200 })),
    );

    await expect(down.search('mèo', 24)).rejects.toBeInstanceOf(GifProviderUnavailableError);
    await expect(httpError.trending(24)).rejects.toBeInstanceOf(GifProviderUnavailableError);
    await expect(badJson.search('mèo', 24)).rejects.toBeInstanceOf(GifProviderUnavailableError);
  });

  it('mỗi lời gọi đều có AbortSignal để không treo vô hạn', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ results: [] }));
    const provider = new TenorProvider('test-key', fetchImpl);

    await provider.search('mèo', 24);

    const [, request] = fetchImpl.mock.calls[0]!;
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });
});
