import { describe, expect, it, vi } from 'vitest';
import type { MetricsService } from '../../infra/metrics/metrics.service.js';
import type { RetrievalService } from '../ai/retrieval/retrieval.service.js';
import type { ReadDbService } from '../../infra/prisma/read-db.service.js';
import { SearchService } from './search.service.js';

describe('Search latency', () => {
  it.each([false, true])('records completion even when the database fails: %s', async (fails) => {
    const query = fails
      ? vi.fn().mockRejectedValue(new Error('database down'))
      : vi.fn().mockResolvedValue([]);
    const searchCompleted = vi.fn();
    const service = new SearchService(
      { client: { $queryRaw: query } } as unknown as ReadDbService,
      { searchCompleted } as unknown as MetricsService,
      { retrieve: vi.fn().mockResolvedValue([]) } as unknown as RetrievalService,
    );
    const result = service.search(
      'server-id',
      { q: 'private search text', limit: 20, mode: 'keyword' },
      'user-id',
    );
    if (fails) await expect(result).rejects.toThrow('database down');
    else await expect(result).resolves.toEqual({ results: [], hasMore: false });
    expect(searchCompleted).toHaveBeenCalledExactlyOnceWith(
      expect.any(Number),
      fails ? 'error' : 'ok',
    );
  });
});

describe('Search plan guard (ADR-0095)', () => {
  const run = async (matched: number) => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ n: matched }])
      .mockResolvedValueOnce([]);
    const service = new SearchService(
      { client: { $queryRaw: query } } as unknown as ReadDbService,
      { searchCompleted: vi.fn() } as unknown as MetricsService,
      { retrieve: vi.fn().mockResolvedValue([]) } as unknown as RetrievalService,
    );
    await service.search('server-id', { q: 'rare', limit: 20, mode: 'keyword' }, 'user-id');
    return (query.mock.calls[1]![0] as { sql: string }).sql;
  };

  it('materializes the matches first when few rows match', async () => {
    expect(await run(3)).toContain('WITH hits AS MATERIALIZED');
  });

  it('keeps the plain ordered scan when the probe hits its cap', async () => {
    expect(await run(1000)).not.toContain('WITH hits');
  });
});

describe('Hybrid search (ADR-0103)', () => {
  const author = { id: 'u1', username: 'u', displayName: 'U', avatarUrl: null };
  const row = (id: string, channelId = 'c1') => ({
    id,
    content: id,
    channelId,
    channelName: 'general',
    createdAt: new Date('2026-11-17T00:00:00Z'),
    authorId: 'u1',
    author,
  });
  const make = (retrieve: () => Promise<unknown>) => {
    // lần gọi đầu là thăm dò (rare), lần hai là truy vấn từ khóa
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ n: 1000 }])
      .mockResolvedValueOnce([row('kw-only'), row('both')]);
    const service = new SearchService(
      {
        client: { $queryRaw: query, channel: { findMany: vi.fn().mockResolvedValue([]) } },
      } as unknown as ReadDbService,
      { searchCompleted: vi.fn() } as unknown as MetricsService,
      { retrieve } as unknown as RetrievalService,
    );
    return service;
  };
  const hit = (id: string) => ({
    score: 1,
    messages: [{ ...row(id), authorId: 'u1', author }],
  });

  it('gộp kết quả từ khóa và vector, mục có ở cả hai lên đầu', async () => {
    const service = make(async () => [hit('both'), hit('vec-only')]);
    const page = await service.search('s', { q: 'x', limit: 10, mode: 'hybrid' }, 'u');
    expect(page.results.map((r) => r.id)).toEqual(['both', 'kw-only', 'vec-only']);
    expect(page.hasMore).toBe(false);
  });

  it('vector hỏng thì rơi về kết quả từ khóa, không lỗi', async () => {
    const service = make(async () => {
      throw new Error('qdrant down');
    });
    const page = await service.search('s', { q: 'x', limit: 10, mode: 'hybrid' }, 'u');
    expect(page.results.map((r) => r.id)).toEqual(['kw-only', 'both']);
  });
});
