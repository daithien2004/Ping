import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('envSchema Kafka (ADR-0094)', () => {
  it('có mặc định cho môi trường dev', () => {
    const env = envSchema.parse(base);
    expect(env.KAFKA_BROKERS).toBe('localhost:9092');
    expect(env.KAFKA_TOPIC).toBe('ping.outbox');
    expect(env.KAFKA_PARTITIONS).toBe(3);
  });

  it('nhận danh sách broker do production đặt', () => {
    expect(envSchema.parse({ ...base, KAFKA_BROKERS: 'kafka:9092' }).KAFKA_BROKERS).toBe(
      'kafka:9092',
    );
  });

  it('từ chối broker rỗng', () => {
    expect(envSchema.safeParse({ ...base, KAFKA_BROKERS: '' }).success).toBe(false);
  });
});
