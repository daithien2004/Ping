import { describe, expect, it, vi } from 'vitest';
import type { MetricsService } from '../../infra/metrics/metrics.service.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SearchService } from './search.service.js';

describe('Search latency', () => {
  it.each([false, true])('records completion even when the database fails: %s', async (fails) => {
    const query = fails
      ? vi.fn().mockRejectedValue(new Error('database down'))
      : vi.fn().mockResolvedValue([]);
    const searchCompleted = vi.fn();
    const service = new SearchService(
      { $queryRaw: query } as unknown as PrismaService,
      { searchCompleted } as unknown as MetricsService,
    );
    const result = service.search('server-id', { q: 'private search text', limit: 20 });
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
      { $queryRaw: query } as unknown as PrismaService,
      { searchCompleted: vi.fn() } as unknown as MetricsService,
    );
    await service.search('server-id', { q: 'rare', limit: 20 });
    return (query.mock.calls[1]![0] as { sql: string }).sql;
  };

  it('materializes the matches first when few rows match', async () => {
    expect(await run(3)).toContain('WITH hits AS MATERIALIZED');
  });

  it('keeps the plain ordered scan when the probe hits its cap', async () => {
    expect(await run(1000)).not.toContain('WITH hits');
  });
});
