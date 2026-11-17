import { SpanKind } from '@opentelemetry/api';
import type { Admin, Consumer, Kafka, Producer } from 'kafkajs';
import { contextFromTraceparent, withSpan } from '../tracing/tracing.js';
import { ensureTopic, type KafkaSettings } from './kafka.client.js';

const LAG_REPORT_MS = 5_000;

export interface OutboxBody {
  id?: string;
  type?: string;
  aggregateType?: string;
  payload?: unknown;
}

export interface EventLoop {
  start(): void;
  stop(): Promise<void>;
}

export interface KafkaEventRunnerOptions {
  groupId: string;
  /** false: group mới bắt đầu từ tin kế tiếp thay vì replay toàn bộ retention. */
  fromBeginning?: boolean;
  /** Số lần thử một event trước khi đưa vào DLQ (mặc định 3). */
  maxAttempts?: number;
  retryDelayMs?: number;
  spanName?: string;
  onLag?: (lag: number) => void;
  onError?: (error: unknown, context: string) => void;
}

export const dlqTopicOf = (topic: string) => `${topic}.dlq`;

/**
 * Consumer chung cho outbox topic (ADR-0094, ADR-0101). Mỗi group có offset riêng, nên nhiều consumer độc lập cùng đọc
 * một topic. Chỉ commit offset sau khi xử lý xong (at-least-once). Event làm handler lỗi được thử lại `maxAttempts` lần;
 * hết lần thì chuyển sang `<topic>.dlq` kèm lý do rồi mới commit, để một event hỏng không chặn cả partition.
 * Nếu ghi DLQ cũng lỗi thì ném lỗi: không commit, kafkajs thử lại, không event nào bị mất âm thầm.
 */
export class KafkaEventRunner implements EventLoop {
  private consumer: Consumer | undefined;
  private admin: Admin | undefined;
  private producer: Producer | undefined;
  private lagTimer: NodeJS.Timeout | undefined;
  private starting: Promise<void> | undefined;
  private stopping = false;

  constructor(
    private readonly kafka: Kafka,
    private readonly settings: KafkaSettings,
    private readonly handle: (body: OutboxBody) => Promise<void>,
    protected readonly options: KafkaEventRunnerOptions,
  ) {}

  start(): void {
    this.starting ??= this.run();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.lagTimer);
    await this.starting?.catch(() => undefined);
    await this.consumer?.disconnect().catch(() => undefined);
    await this.producer?.disconnect().catch(() => undefined);
    await this.admin?.disconnect().catch(() => undefined);
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      try {
        this.admin = this.kafka.admin();
        await this.admin.connect();
        await ensureTopic(this.admin, this.settings);

        this.consumer = this.kafka.consumer({
          groupId: this.options.groupId,
          sessionTimeout: 30_000,
          heartbeatInterval: 3_000,
        });
        await this.consumer.connect();
        await this.consumer.subscribe({
          topic: this.settings.topic,
          fromBeginning: this.options.fromBeginning ?? true,
        });
        await this.consumer.run({
          autoCommit: true,
          eachMessage: async ({ message, partition }) => {
            const body = JSON.parse(message.value?.toString('utf8') ?? '{}') as OutboxBody;
            const traceparent = message.headers?.traceparent?.toString();
            const maxAttempts = this.options.maxAttempts ?? 3;
            let lastError: unknown;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                await withSpan(
                  this.options.spanName ?? 'event.handle',
                  {
                    'messaging.system': 'kafka',
                    'messaging.consumer.group.name': this.options.groupId,
                    'ping.event_type': body.type ?? '',
                    'ping.attempt': attempt,
                  },
                  () => this.handle(body),
                  { parent: contextFromTraceparent(traceparent), kind: SpanKind.CONSUMER },
                );
                return;
              } catch (error) {
                lastError = error;
                this.options.onError?.(error, `handler attempt ${attempt}`);
                if (attempt < maxAttempts) {
                  await new Promise((r) =>
                    setTimeout(r, (this.options.retryDelayMs ?? 200) * attempt),
                  );
                }
              }
            }
            await this.deadLetter(message, partition, lastError, maxAttempts);
          },
        });
        this.scheduleLag();
        return;
      } catch (error) {
        this.options.onError?.(error, 'kafka consumer start');
        await this.consumer?.disconnect().catch(() => undefined);
        await this.admin?.disconnect().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  }

  private async deadLetter(
    message: { key: Buffer | null; value: Buffer | null; offset: string; headers?: unknown },
    partition: number,
    error: unknown,
    attempts: number,
  ): Promise<void> {
    const dlq = dlqTopicOf(this.settings.topic);
    if (!this.producer) {
      const admin = this.kafka.admin();
      await admin.connect();
      try {
        await ensureTopic(admin, { ...this.settings, topic: dlq, partitions: 1 });
      } finally {
        await admin.disconnect();
      }
      this.producer = this.kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
      await this.producer.connect();
    }
    const original = Object.fromEntries(
      Object.entries(
        (message.headers ?? {}) as Record<string, Buffer | string | undefined>,
      ).flatMap(([k, v]) => (v === undefined ? [] : [[k, v.toString()]])),
    );
    await this.producer.send({
      topic: dlq,
      acks: -1,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: {
            ...original,
            'dlq-group': this.options.groupId,
            'dlq-source': `${this.settings.topic}[${partition}]@${message.offset}`,
            'dlq-attempts': String(attempts),
            'dlq-error': String((error as Error)?.message ?? error).slice(0, 500),
          },
        },
      ],
    });
    this.options.onError?.(
      error,
      `dead-lettered ${this.settings.topic}[${partition}]@${message.offset}`,
    );
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
        admin.fetchOffsets({ groupId: this.options.groupId, topics: [this.settings.topic] }),
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
