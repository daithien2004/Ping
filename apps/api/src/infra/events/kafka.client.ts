import type { ConfigService } from '@nestjs/config';
import { Kafka, logLevel, type Admin } from 'kafkajs';
import type { Env } from '../../config/env.schema.js';

export interface KafkaSettings {
  brokers: string[];
  clientId: string;
  topic: string;
  partitions: number;
}

export const OUTBOX_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function createKafka(settings: Pick<KafkaSettings, 'brokers' | 'clientId'>): Kafka {
  return new Kafka({
    clientId: settings.clientId,
    brokers: settings.brokers,
    // Log của kafkajs là JSON riêng; chỉ lấy lỗi, lỗi nghiệp vụ đi qua logger của Nest.
    logLevel: logLevel.NOTHING,
    connectionTimeout: 3_000,
    requestTimeout: 10_000,
    retry: { initialRetryTime: 300, retries: 8 },
  });
}

/** Tạo topic nếu chưa có (idempotent). Giữ 7 ngày để consumer group mới replay được; replication 1 vì dev/VPS một broker. */
export async function ensureTopic(admin: Admin, settings: KafkaSettings): Promise<void> {
  await admin.createTopics({
    waitForLeaders: true,
    topics: [
      {
        topic: settings.topic,
        numPartitions: settings.partitions,
        replicationFactor: 1,
        configEntries: [{ name: 'retention.ms', value: String(OUTBOX_RETENTION_MS) }],
      },
    ],
  });
}

export function kafkaSettings(config: ConfigService<Env, true>): KafkaSettings {
  return {
    brokers: parseBrokers(config.getOrThrow('KAFKA_BROKERS', { infer: true })),
    clientId: config.get('KAFKA_CLIENT_ID', { infer: true }),
    topic: config.get('KAFKA_TOPIC', { infer: true }),
    partitions: config.get('KAFKA_PARTITIONS', { infer: true }),
  };
}

export function parseBrokers(raw: string): string[] {
  return raw
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
}
