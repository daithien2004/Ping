import type { Redis } from 'ioredis';
import type { MessageIndexerCore } from './message-indexer.core.js';

export const INDEXER_STREAM = 'stream:outbox';
export const INDEXER_GROUP = 'ai-indexer';

type StreamEntry = [id: string, fields: string[]];

export interface IndexerRunnerOptions {
  consumer: string;
  stream?: string;
  group?: string;
  /** Entry pending lâu hơn ngưỡng này sẽ được nhận lại (consumer chết giữa chừng). */
  claimIdleMs?: number;
  /** Tổng entry chưa xử lý xong (lag + pending). */
  onLag?: (lag: number) => void;
  onError?: (error: unknown, context: string) => void;
}

/**
 * Vòng lặp consumer Redis Stream, tách khỏi Nest để drill/backfill dùng lại.
 *
 * Cam kết: chỉ `XACK` sau khi xử lý thành công. Consumer chết sau khi upsert
 * Qdrant nhưng trước khi ack sẽ khiến entry nằm trong pending; consumer mới
 * `XAUTOCLAIM` rồi xử lý lại — upsert theo id tin nhắn nên không tạo point trùng.
 */
export class IndexerRunner {
  private readonly stream: string;
  private readonly group: string;
  private readonly claimIdleMs: number;
  private stopping = false;
  private running: Promise<void> | undefined;
  private groupReady = false;

  constructor(
    private readonly redis: Redis,
    private readonly core: MessageIndexerCore,
    private readonly options: IndexerRunnerOptions,
  ) {
    this.stream = options.stream ?? INDEXER_STREAM;
    this.group = options.group ?? INDEXER_GROUP;
    this.claimIdleMs = options.claimIdleMs ?? 30_000;
  }

  start(): void {
    this.running ??= this.loop();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await this.running;
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
        await this.ensureGroup();
        await this.reclaimPending();
        const entries = await this.readNew();
        await this.process(entries);
        await this.reportLag();
      } catch (error) {
        this.options.onError?.(error, 'indexer loop');
        await sleep(500);
      }
    }
  }

  private async ensureGroup(): Promise<void> {
    if (this.groupReady) return;
    try {
      await this.redis.xgroup('CREATE', this.stream, this.group, '0', 'MKSTREAM');
    } catch (error) {
      // Nhóm đã tồn tại là trạng thái bình thường khi nhiều instance cùng chạy.
      if (!String((error as Error).message).includes('BUSYGROUP')) throw error;
    }
    this.groupReady = true;
  }

  private async readNew(): Promise<StreamEntry[]> {
    const result = (await this.redis.xreadgroup(
      'GROUP',
      this.group,
      this.options.consumer,
      'COUNT',
      10,
      'BLOCK',
      500,
      'STREAMS',
      this.stream,
      '>',
    )) as unknown as [string, StreamEntry[]][] | null;
    return result?.flatMap(([, entries]) => entries) ?? [];
  }

  private async reclaimPending(): Promise<void> {
    const result = (await this.redis.call(
      'XAUTOCLAIM',
      this.stream,
      this.group,
      this.options.consumer,
      this.claimIdleMs,
      '0-0',
      'COUNT',
      10,
    )) as unknown as [string, StreamEntry[], string[]];
    const entries = result?.[1] ?? [];
    if (entries.length > 0) {
      await this.process(entries);
    }
  }

  private async process(entries: readonly StreamEntry[]): Promise<void> {
    for (const [streamId, fields] of entries) {
      const event = toRecord(fields);
      const type = event.type;
      if (!type || !type.startsWith('message.')) {
        await this.ack(streamId);
        continue;
      }

      const messageId = messageIdOf(event.payload);
      if (!messageId) {
        await this.ack(streamId);
        continue;
      }

      // Không ack ở đây: lỗi DB/embedding/Qdrant phải để entry pending và thử lại.
      await this.core.handleEvent(type, messageId);
      await this.ack(streamId);
    }
  }

  private async ack(streamId: string): Promise<void> {
    await this.redis.xack(this.stream, this.group, streamId);
  }

  private async reportLag(): Promise<void> {
    const pending = (await this.redis.call('XPENDING', this.stream, this.group)) as unknown as
      [number, ...unknown[]] | null;
    const pendingCount = Number(pending?.[0] ?? 0);

    const groups = (await this.redis.call(
      'XINFO',
      'GROUPS',
      this.stream,
    )) as unknown as unknown[][];
    let lag = 0;
    for (const group of groups ?? []) {
      const nameIndex = group.indexOf('name');
      if (nameIndex >= 0 && group[nameIndex + 1] === this.group) {
        const lagIndex = group.indexOf('lag');
        lag = Number(group[lagIndex + 1] ?? 0);
      }
    }
    this.options.onLag?.(lag + pendingCount);
  }
}

function toRecord(fields: readonly string[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const key = fields[index];
    const value = fields[index + 1];
    if (key !== undefined && value !== undefined) record[key] = value;
  }
  return record;
}

function messageIdOf(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const payload = JSON.parse(raw) as { id?: unknown };
    return typeof payload.id === 'string' ? payload.id : undefined;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
