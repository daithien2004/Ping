import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../../config/env.schema.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { RedisProvider } from '../../../infra/redis/redis.module.js';
import { AiUnavailableError, type LlmUsage } from '../llm-client.port.js';

export class AiQuotaExceededError extends Error {
  constructor(readonly limit: number) {
    super(`Đã dùng hết ${limit} lượt hỏi AI hôm nay`);
    this.name = 'AiQuotaExceededError';
  }
}

export class AiBudgetExhaustedError extends Error {
  constructor(
    readonly limitUsd: number,
    readonly spentUsd: number,
  ) {
    super(`Ngân sách AI trong ngày đã hết (${spentUsd.toFixed(4)}/${limitUsd} USD)`);
    this.name = 'AiBudgetExhaustedError';
  }
}

// Redis chết thì từ chối AI (fail-closed) để không hở chi phí. Hai request đồng thời có thể
// vượt trần ngân sách rất nhẹ (chấp nhận).
@Injectable()
export class AiUsageService {
  private readonly requestLimit: number;
  private readonly budgetUsd: number;
  private readonly inputPricePerMTok: number;
  private readonly outputPricePerMTok: number;

  constructor(
    config: ConfigService<Env, true>,
    private readonly redis: RedisProvider,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.requestLimit = config.get('AI_DAILY_REQUEST_LIMIT', { infer: true });
    this.budgetUsd = config.get('AI_DAILY_BUDGET_USD', { infer: true });
    this.inputPricePerMTok = config.get('AI_PRICE_INPUT_PER_MTOK', { infer: true });
    this.outputPricePerMTok = config.get('AI_PRICE_OUTPUT_PER_MTOK', { infer: true });
  }

  async reserveQuota(userId: string): Promise<void> {
    if (!this.redis.isUp) {
      throw new AiUnavailableError('Không kiểm tra được hạn mức AI');
    }

    const key = quotaKey(utcDay(), userId);
    try {
      const used = await this.redis.incr(key);
      if (used === 1) await this.redis.expire(key, 2 * 24 * 60 * 60);
      if (used > this.requestLimit) throw new AiQuotaExceededError(this.requestLimit);
    } catch (error) {
      if (error instanceof AiQuotaExceededError) throw error;
      throw new AiUnavailableError('Không kiểm tra được hạn mức AI');
    }
  }

  async assertWithinBudget(): Promise<void> {
    if (this.budgetUsd <= 0) return; // 0 = tắt kill-switch

    let spentUsd: number;
    try {
      spentUsd = await this.spentTodayUsd();
    } catch {
      throw new AiUnavailableError('Không đọc được chi phí AI');
    }
    if (spentUsd >= this.budgetUsd) {
      throw new AiBudgetExhaustedError(this.budgetUsd, spentUsd);
    }
  }

  async spentTodayUsd(): Promise<number> {
    const result = await this.prisma.aiUsage.aggregate({
      _sum: { costUsd: true },
      where: { day: dayDate(utcDay()) },
    });
    return Number(result._sum.costUsd ?? 0);
  }

  async record(userId: string, usage?: LlmUsage): Promise<number> {
    const promptTokens = usage?.promptTokens ?? 0;
    const completionTokens = usage?.completionTokens ?? 0;
    const costUsd = this.estimateCost(promptTokens, completionTokens);
    const day = dayDate(utcDay());

    try {
      await this.prisma.aiUsage.upsert({
        where: { userId_day: { userId, day } },
        create: {
          userId,
          day,
          requests: 1,
          promptTokens,
          completionTokens,
          costUsd,
        },
        update: {
          requests: { increment: 1 },
          promptTokens: { increment: promptTokens },
          completionTokens: { increment: completionTokens },
          costUsd: { increment: costUsd },
        },
      });
    } catch (error) {
      this.logger.warn({ err: error }, 'không ghi được AiUsage');
    }

    return costUsd;
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    return (
      (promptTokens / 1_000_000) * this.inputPricePerMTok +
      (completionTokens / 1_000_000) * this.outputPricePerMTok
    );
  }
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function quotaKey(day: string, userId: string): string {
  return `ai:quota:${day}:${userId}`;
}

function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
