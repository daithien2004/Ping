import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('envSchema BUS_DRIVER (ADR-0094)', () => {
  it('mặc định là redis và không cần Kafka', () => {
    const env = envSchema.parse(base);
    expect(env.BUS_DRIVER).toBe('redis');
    expect(env.KAFKA_TOPIC).toBe('ping.outbox');
    expect(env.KAFKA_PARTITIONS).toBe(3);
  });

  it('kafka thiếu KAFKA_BROKERS thì báo lỗi đúng trường', () => {
    const result = envSchema.safeParse({ ...base, BUS_DRIVER: 'kafka' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['KAFKA_BROKERS']);
  });

  it('chuỗi rỗng coi như chưa đặt', () => {
    expect(envSchema.safeParse({ ...base, BUS_DRIVER: 'kafka', KAFKA_BROKERS: '' }).success).toBe(
      false,
    );
  });

  it('kafka có broker thì hợp lệ', () => {
    const env = envSchema.parse({
      ...base,
      BUS_DRIVER: 'kafka',
      KAFKA_BROKERS: 'localhost:9092',
    });
    expect(env.KAFKA_BROKERS).toBe('localhost:9092');
  });

  it('từ chối driver lạ', () => {
    expect(envSchema.safeParse({ ...base, BUS_DRIVER: 'rabbit' }).success).toBe(false);
  });
});
