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
