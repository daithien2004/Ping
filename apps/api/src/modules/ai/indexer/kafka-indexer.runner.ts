import type { Admin, Consumer, Kafka } from 'kafkajs';
import { ensureTopic, type KafkaSettings } from '../../../infra/events/kafka.client.js';
import { indexerCallOf, type IndexerLoop } from './indexer-event.js';
import type { MessageIndexerCore } from './message-indexer.core.js';

export const KAFKA_INDEXER_GROUP = 'ai-indexer';
const LAG_REPORT_MS = 5_000;

export interface KafkaIndexerOptions {
  groupId?: string;
  /** false: group mới bắt đầu từ tin kế tiếp thay vì replay toàn bộ retention. */
  fromBeginning?: boolean;
  onLag?: (lag: number) => void;
  onError?: (error: unknown, context: string) => void;
}

/**
 * Cùng ngữ nghĩa với `IndexerRunner` (Redis): chỉ commit offset sau khi xử lý xong, upsert theo id tin nên xử lý
 * lại không tạo point trùng (at-least-once). Khác Redis: event cùng id tin nằm cùng partition và được một
 * consumer xử lý tuần tự, nên `message.deleted` không thể chạy trước `message.created` của chính tin đó.
 */
export class KafkaIndexerRunner implements IndexerLoop {
  private readonly groupId: string;
  private consumer: Consumer | undefined;
  private admin: Admin | undefined;
  private lagTimer: NodeJS.Timeout | undefined;
  private starting: Promise<void> | undefined;
  private stopping = false;

  constructor(
    private readonly kafka: Kafka,
    private readonly settings: KafkaSettings,
    private readonly core: Pick<MessageIndexerCore, 'handleEvent'>,
    private readonly options: KafkaIndexerOptions = {},
  ) {
    this.groupId = options.groupId ?? KAFKA_INDEXER_GROUP;
  }

  start(): void {
    this.starting ??= this.run();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.lagTimer);
    await this.starting?.catch(() => undefined);
    await this.consumer?.disconnect().catch(() => undefined);
    await this.admin?.disconnect().catch(() => undefined);
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      try {
        this.admin = this.kafka.admin();
        await this.admin.connect();
        await ensureTopic(this.admin, this.settings);

        this.consumer = this.kafka.consumer({
          groupId: this.groupId,
          sessionTimeout: 30_000,
          heartbeatInterval: 3_000,
        });
        await this.consumer.connect();
        await this.consumer.subscribe({
          topic: this.settings.topic,
          fromBeginning: this.options.fromBeginning ?? true,
        });
        // Handler ném lỗi: kafkajs thử lại cùng offset (backoff) rồi khởi động lại consumer, không commit và không bỏ qua.
        await this.consumer.run({
          autoCommit: true,
          eachMessage: async ({ message }) => {
            const body = JSON.parse(message.value?.toString('utf8') ?? '{}') as {
              type?: string;
              payload?: unknown;
            };
            const call = indexerCallOf(body.type, JSON.stringify(body.payload ?? null));
            if (call) await this.core.handleEvent(call.type, call.messageId);
          },
        });
        this.scheduleLag();
        return;
      } catch (error) {
        this.options.onError?.(error, 'kafka indexer start');
        await this.consumer?.disconnect().catch(() => undefined);
        await this.admin?.disconnect().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  }

  private scheduleLag(): void {
    if (this.stopping) return;
    this.lagTimer = setTimeout(() => {
      void this.reportLag().finally(() => this.scheduleLag());
    }, LAG_REPORT_MS);
  }

  /** Lag = tổng (offset cuối của partition − offset đã commit của group); chưa commit thì tính từ offset đầu còn giữ. */
  async reportLag(): Promise<number> {
    try {
      const admin = this.admin;
      if (!admin) return 0;
      const [ends, groups] = await Promise.all([
        admin.fetchTopicOffsets(this.settings.topic),
        admin.fetchOffsets({ groupId: this.groupId, topics: [this.settings.topic] }),
      ]);
      const committed = new Map(
        (groups[0]?.partitions ?? []).map((entry) => [entry.partition, Number(entry.offset)]),
      );
      let lag = 0;
      for (const end of ends) {
        const done = committed.get(end.partition) ?? -1;
        lag += Number(end.high) - (done >= 0 ? done : Number(end.low));
      }
      this.options.onLag?.(lag);
      return lag;
    } catch (error) {
      this.options.onError?.(error, 'kafka lag');
      return 0;
    }
  }
}
