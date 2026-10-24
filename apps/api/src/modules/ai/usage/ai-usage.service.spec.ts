import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../config/env.schema.js';
import type { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { RedisProvider } from '../../../infra/redis/redis.module.js';
import { AiUnavailableError } from '../llm-client.port.js';
import {
  AiBudgetExhaustedError,
  AiQuotaExceededError,
  AiUsageService,
  quotaKey,
  utcDay,
} from './ai-usage.service.js';

const USER_ID = '22222222-2222-4222-8222-222222222222';

interface SetupOptions {
  limit?: number;
  budgetUsd?: number;
  inputPrice?: number;
  outputPrice?: number;
  redisUp?: boolean;
  used?: number;
  spentUsd?: number | null;
  redisError?: Error;
  dbError?: Error;
}

function setup(options: SetupOptions = {}) {
  const values: Partial<Record<keyof Env, number>> = {
    AI_DAILY_REQUEST_LIMIT: options.limit ?? 3,
    AI_DAILY_BUDGET_USD: options.budgetUsd ?? 1,
    AI_PRICE_INPUT_PER_MTOK: options.inputPrice ?? 0,
    AI_PRICE_OUTPUT_PER_MTOK: options.outputPrice ?? 0,
  };
  const config = {
    get: vi.fn((key: keyof Env) => values[key]),
  } as unknown as ConfigService<Env, true>;

  const incr = options.redisError
    ? vi.fn(async (): Promise<number> => {
        throw options.redisError;
      })
    : vi.fn(async () => options.used ?? 1);
  const expire = vi.fn(async () => 1);
  const redis = { isUp: options.redisUp ?? true, incr, expire } as unknown as RedisProvider;

  const aggregate = options.dbError
    ? vi.fn(async (): Promise<never> => {
        throw options.dbError;
      })
    : vi.fn(async () => ({
        _sum: { costUsd: options.spentUsd === undefined ? 0 : options.spentUsd },
      }));
  const upsert = options.dbError
    ? vi.fn(async (): Promise<never> => {
        throw options.dbError;
      })
    : vi.fn(async () => ({}));
  const prisma = { aiUsage: { aggregate, upsert } } as unknown as PrismaService;

  const logger = { warn: vi.fn() } as unknown as PinoLogger;

  const service = new AiUsageService(config, redis, prisma, logger);
  return { service, incr, expire, aggregate, upsert, logger };
}

describe('AiUsageService', () => {
  describe('reserveQuota', () => {
    it('tăng bộ đếm ngày của user và đặt TTL ở lần đầu', async () => {
      const { service, incr, expire } = setup({ used: 1 });

      await service.reserveQuota(USER_ID);

      expect(incr).toHaveBeenCalledWith(quotaKey(utcDay(), USER_ID));
      expect(expire).toHaveBeenCalledWith(quotaKey(utcDay(), USER_ID), 2 * 24 * 60 * 60);
    });

    it('không đặt lại TTL khi bộ đếm đã tồn tại', async () => {
      const { service, expire } = setup({ used: 2 });

      await service.reserveQuota(USER_ID);

      expect(expire).not.toHaveBeenCalled();
    });

    it('vượt hạn mức thì ném AiQuotaExceededError kèm giới hạn', async () => {
      const { service } = setup({ limit: 3, used: 4 });

      const error = await service.reserveQuota(USER_ID).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AiQuotaExceededError);
      expect((error as AiQuotaExceededError).limit).toBe(3);
    });

    it('Redis chết thì fail-closed bằng AiUnavailableError, không gọi incr', async () => {
      const { service, incr } = setup({ redisUp: false });

      await expect(service.reserveQuota(USER_ID)).rejects.toBeInstanceOf(AiUnavailableError);
      expect(incr).not.toHaveBeenCalled();
    });

    it('lỗi Redis được đổi thành AiUnavailableError (không lộ chi tiết)', async () => {
      const { service } = setup({ redisError: new Error('ECONNRESET') });

      await expect(service.reserveQuota(USER_ID)).rejects.toBeInstanceOf(AiUnavailableError);
    });
  });

  describe('assertWithinBudget', () => {
    it('bỏ qua khi ngân sách = 0 (kill-switch tắt)', async () => {
      const { service, aggregate } = setup({ budgetUsd: 0, spentUsd: 99 });

      await expect(service.assertWithinBudget()).resolves.toBeUndefined();
      expect(aggregate).not.toHaveBeenCalled();
    });

    it('ném AiBudgetExhaustedError khi đã chạm trần', async () => {
      const { service } = setup({ budgetUsd: 1, spentUsd: 1.5 });

      const error = await service.assertWithinBudget().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AiBudgetExhaustedError);
      expect(error).toMatchObject({ limitUsd: 1, spentUsd: 1.5 });
    });

    it('cho qua khi còn dưới trần', async () => {
      const { service } = setup({ budgetUsd: 1, spentUsd: 0.25 });

      await expect(service.assertWithinBudget()).resolves.toBeUndefined();
    });

    it('không đọc được chi phí thì AI_UNAVAILABLE (fail-closed)', async () => {
      const { service } = setup({ dbError: new Error('db down') });

      await expect(service.assertWithinBudget()).rejects.toBeInstanceOf(AiUnavailableError);
    });
  });

  describe('spentTodayUsd', () => {
    it('cộng costUsd của đúng ngày UTC hiện tại', async () => {
      const { service, aggregate } = setup({ spentUsd: 0.42 });

      await expect(service.spentTodayUsd()).resolves.toBe(0.42);
      expect(aggregate).toHaveBeenCalledWith({
        _sum: { costUsd: true },
        where: { day: new Date(`${utcDay()}T00:00:00.000Z`) },
      });
    });

    it('không có bản ghi nào thì trả 0', async () => {
      const { service } = setup({ spentUsd: null });

      await expect(service.spentTodayUsd()).resolves.toBe(0);
    });
  });

  describe('record', () => {
    it('upsert theo (user, ngày) với increment token/chi phí', async () => {
      const { service, upsert } = setup({ inputPrice: 2, outputPrice: 8 });

      const cost = await service.record(USER_ID, {
        promptTokens: 1_000_000,
        completionTokens: 500_000,
        totalTokens: 1_500_000,
      });

      expect(cost).toBe(6);
      expect(upsert).toHaveBeenCalledWith({
        where: { userId_day: { userId: USER_ID, day: new Date(`${utcDay()}T00:00:00.000Z`) } },
        create: {
          userId: USER_ID,
          day: new Date(`${utcDay()}T00:00:00.000Z`),
          requests: 1,
          promptTokens: 1_000_000,
          completionTokens: 500_000,
          costUsd: 6,
        },
        update: {
          requests: { increment: 1 },
          promptTokens: { increment: 1_000_000 },
          completionTokens: { increment: 500_000 },
          costUsd: { increment: 6 },
        },
      });
    });

    it('không có usage thì vẫn ghi một request với 0 token', async () => {
      const { service, upsert } = setup();

      await service.record(USER_ID);

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ requests: 1, promptTokens: 0, completionTokens: 0 }),
        }),
      );
    });

    it('lỗi ghi DB chỉ log, không làm hỏng câu trả lời', async () => {
      const { service, logger } = setup({ dbError: new Error('db down') });

      await expect(service.record(USER_ID)).resolves.toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('estimateCost', () => {
    it('free tier (giá 0) luôn ra 0', () => {
      const { service } = setup();

      expect(service.estimateCost(10_000, 5_000)).toBe(0);
    });

    it('tính theo giá mỗi triệu token', () => {
      const { service } = setup({ inputPrice: 0.1, outputPrice: 0.4 });

      expect(service.estimateCost(2_000_000, 1_000_000)).toBeCloseTo(0.6, 10);
    });
  });
});

describe('utcDay', () => {
  it('cắt theo ngày UTC, không theo múi giờ máy', () => {
    expect(utcDay(new Date('2026-10-24T23:59:59.999Z'))).toBe('2026-10-24');
    expect(utcDay(new Date('2026-10-25T00:00:00.000Z'))).toBe('2026-10-25');
  });
});
