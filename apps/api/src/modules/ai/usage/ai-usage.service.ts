import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../../config/env.schema.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { RedisProvider } from '../../../infra/redis/redis.module.js';
import { AiUnavailableError, type LlmUsage } from '../llm-client.port.js';

/** Vượt hạn mức request/ngày của user (T5.7). */
export class AiQuotaExceededError extends Error {
  constructor(readonly limit: number) {
    super(`Đã dùng hết ${limit} lượt hỏi AI hôm nay`);
    this.name = 'AiQuotaExceededError';
  }
}

/** Chạm trần chi phí AI toàn hệ thống trong ngày (kill-switch). */
export class AiBudgetExhaustedError extends Error {
  constructor(
    readonly limitUsd: number,
    readonly spentUsd: number,
  ) {
    super(`Ngân sách AI trong ngày đã hết (${spentUsd.toFixed(4)}/${limitUsd} USD)`);
    this.name = 'AiBudgetExhaustedError';
  }
}

/**
 * Hạn mức và chi phí AI (T5.7, ADR-0047).
 *
 * - Quota request/user/ngày đếm bằng Redis (nguyên tử, TTL 2 ngày). Redis chết thì từ chối
 *   AI (fail-closed) thay vì để hở chi phí; chat/search không phụ thuộc Redis này.
 * - Kill-switch ngân sách đọc tổng `AiUsage.costUsd` của ngày (UTC) trong Postgres: số liệu
 *   bền, không lệch khi Redis mất dữ liệu. Chỉ chặn lời gọi LLM mới, không chặn cache.
 * - Mọi lời gọi LLM ghi `AiUsage` (token/chi phí) và không lưu prompt/nội dung tin.
 *
 * Ghi chú cạnh tranh: hai request đồng thời có thể cùng qua cửa kiểm tra trước khi bản ghi
 * chi phí đầu tiên được ghi; trần ngân sách vì vậy có thể vượt rất nhẹ. Chấp nhận ở quy mô
 * hiện tại (xem ADR-0047).
 */
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

  /** Giữ một lượt trong quota ngày của user; ném lỗi nếu đã hết hoặc Redis không sẵn sàng. */
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

  /** Ném `AiBudgetExhaustedError` nếu tổng chi phí hôm nay đã chạm trần. */
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

  /** Tổng chi phí AI (USD) của ngày UTC hiện tại, đọc từ Postgres. */
  async spentTodayUsd(): Promise<number> {
    const result = await this.prisma.aiUsage.aggregate({
      _sum: { costUsd: true },
      where: { day: dayDate(utcDay()) },
    });
    return Number(result._sum.costUsd ?? 0);
  }

  /**
   * Ghi token/chi phí sau một lời gọi LLM. Trả về chi phí ước tính để caller ghi metric.
   * Lỗi ghi DB không làm hỏng câu trả lời (chỉ log), vì người dùng đã trả giá bằng thời gian.
   */
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
      // Không log prompt/nội dung; chỉ log lỗi hạ tầng.
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

/** Ngày UTC dạng `YYYY-MM-DD` — khoá quota và cột `AiUsage.day`. */
export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Khoá Redis đếm request/ngày của một user. */
export function quotaKey(day: string, userId: string): string {
  return `ai:quota:${day}:${userId}`;
}

function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
