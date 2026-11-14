import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { MessageIndexerCore } from '../../src/modules/ai/indexer/message-indexer.core.js';

export interface BackfillOptions {
  prisma: PrismaClient;
  core: MessageIndexerCore;
  /** Số tin/giây; 0 = không nghỉ (rebuild offline). */
  ratePerSecond: number;
  after?: string;
  limit?: number;
  pageSize?: number;
  onProgress?: (processed: number, lastId: string) => void;
}

export interface BackfillResult {
  processed: number;
  lastId: string | undefined;
  durationMs: number;
}

export function parseRate(raw: string | undefined): number {
  const value = Number(raw ?? '10');
  if (!Number.isFinite(value) || value < 0) return 10;
  return Math.min(value, 1000);
}

export async function backfillMessages(options: BackfillOptions): Promise<BackfillResult> {
  const started = performance.now();
  const pageSize = options.pageSize ?? 50;
  const delayMs = options.ratePerSecond > 0 ? 1000 / options.ratePerSecond : 0;

  let cursor = options.after;
  let processed = 0;

  while (true) {
    const rows = await options.prisma.message.findMany({
      where: {
        deletedAt: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: pageSize,
      select: { id: true },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (options.limit !== undefined && processed >= options.limit) {
        break;
      }
      await options.core.syncMessage(row.id);
      processed += 1;
      cursor = row.id;
      options.onProgress?.(processed, row.id);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (rows.length < pageSize) break;
    if (options.limit !== undefined && processed >= options.limit) break;
  }

  return { processed, lastId: cursor, durationMs: Math.round(performance.now() - started) };
}
