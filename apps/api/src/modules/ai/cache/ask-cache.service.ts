import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema.js';
import { RedisProvider } from '../../../infra/redis/redis.module.js';

// Tăng khi đổi prompt/định dạng trả lời để không trộn câu trả lời cũ.
export const ASK_PROMPT_VERSION = 'ask-v2-strict-citations';

export interface CachedAskAnswer {
  answer: string;
  citations: string[];
  model: string;
}

@Injectable()
export class AskCacheService {
  private readonly ttlSeconds: number;

  constructor(
    config: ConfigService<Env, true>,
    private readonly redis: RedisProvider,
  ) {
    this.ttlSeconds = config.get('AI_CACHE_TTL_SECONDS', { infer: true });
  }

  buildKey(parts: {
    serverId: string;
    channelId?: string;
    messageIds: readonly string[];
    model: string;
    question: string;
  }): string {
    const canonical = [
      parts.serverId,
      parts.channelId ?? '-',
      [...parts.messageIds].sort().join(','),
      parts.model,
      ASK_PROMPT_VERSION,
      normalizeQuestion(parts.question),
    ].join('|');
    const digest = createHash('sha256').update(canonical).digest('hex');
    return `ai:ask:${digest}`;
  }

  async get(key: string): Promise<CachedAskAnswer | null> {
    if (this.ttlSeconds <= 0 || !this.redis.isUp) return null;
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return parseCachedAnswer(raw);
    } catch {
      return null;
    }
  }

  async set(key: string, value: CachedAskAnswer): Promise<void> {
    if (this.ttlSeconds <= 0 || !this.redis.isUp) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', this.ttlSeconds);
    } catch {
      // fail-open: lỗi Redis không được làm hỏng câu trả lời.
    }
  }
}

function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseCachedAnswer(raw: string): CachedAskAnswer | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.answer !== 'string' || typeof record.model !== 'string') return null;
    if (!Array.isArray(record.citations)) return null;
    const citations = record.citations.filter((id): id is string => typeof id === 'string');
    if (citations.length === 0) return null;
    return { answer: record.answer, citations, model: record.model };
  } catch {
    return null;
  }
}
