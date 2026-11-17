import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { Kafka, Producer } from 'kafkajs';
import type { MetricsService } from '../metrics/metrics.service.js';
import { orderingKey, type EventPublisher, type OutboxMessage } from './event-publisher.js';
import { currentTraceparent } from '../tracing/tracing.js';
import { createKafka, ensureTopic, type KafkaSettings } from './kafka.client.js';

const RECONNECT_MS = 2_000;

/** Phát outbox vào Kafka. Cùng `orderingKey` thì cùng partition nên một tin giữ đúng thứ tự sự kiện. */
export class KafkaPublisher implements EventPublisher, OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaPublisher.name);
  private readonly producer: Producer;
  private readonly kafka: Kafka;
  private connected = false;
  private ready = false;
  private stopped = false;
  private connecting = false;
  private retry: NodeJS.Timeout | undefined;

  constructor(
    private readonly settings: KafkaSettings,
    metrics?: Pick<MetricsService, 'registerDependency'>,
  ) {
    this.kafka = createKafka(settings);
    // `idempotent` + acks=-1: producer retry không tạo bản ghi trùng trong một phiên.
    // Thất bại nhanh (mặc định kafkajs treo ~47 giây khi broker chết): relay giữ khóa hàng trong lúc publish.
    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
      retry: { retries: 1, initialRetryTime: 200, maxRetryTime: 1_000 },
    });
    this.producer.on(this.producer.events.CONNECT, () => (this.connected = true));
    this.producer.on(this.producer.events.DISCONNECT, () => (this.connected = false));
    metrics?.registerDependency('kafka', () => this.isUp);
  }

  get isUp(): boolean {
    return this.connected && this.ready;
  }

  onModuleInit(): void {
    void this.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retry);
    await this.producer.disconnect().catch(() => undefined);
  }

  async publish(event: OutboxMessage): Promise<void> {
    try {
      await this.send(event);
    } catch (error) {
      // kafkajs không phát DISCONNECT khi broker chết (chỉ retry): tự đánh dấu chết để relay ngừng thử
      // cho tới khi kết nối lại và topic sẵn sàng.
      if (this.ready) {
        this.ready = false;
        void this.connect();
      }
      throw error;
    }
  }

  private async send(event: OutboxMessage): Promise<void> {
    await this.producer.send({
      topic: this.settings.topic,
      acks: -1,
      messages: [
        {
          key: orderingKey(event),
          value: JSON.stringify({
            id: event.id,
            type: event.type,
            aggregateType: event.aggregateType,
            payload: event.payload,
          }),
          headers: {
            type: event.type,
            eventId: event.id,
            // Span đang chạy (outbox.publish) làm cha của span consumer.
            ...(currentTraceparent() ? { traceparent: currentTraceparent()! } : {}),
          },
        },
      ],
    });
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    try {
      await this.producer.connect();
      const admin = this.kafka.admin();
      await admin.connect();
      try {
        await ensureTopic(admin, this.settings);
      } finally {
        await admin.disconnect();
      }
      this.ready = true;
      this.logger.log({ topic: this.settings.topic }, 'kafka publisher ready');
    } catch (error) {
      this.logger.warn({ err: (error as Error).message }, 'kafka chưa sẵn sàng, thử lại');
      this.retry = setTimeout(() => void this.connect(), RECONNECT_MS);
    } finally {
      this.connecting = false;
    }
  }
}
