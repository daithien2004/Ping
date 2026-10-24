import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../config/env.schema.js';
import type { RedisProvider } from '../../../infra/redis/redis.module.js';
import { AskCacheService } from './ask-cache.service.js';

const SERVER_ID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_A = '019a1bdf-8959-7186-aee6-9554201d3365';
const MESSAGE_B = '019a1bdf-9516-71fb-875e-16d5d62ae85e';

const answer = { answer: 'Trả lời', citations: [MESSAGE_A], model: 'fake' };

function setup(
  options: { ttl?: number; redisUp?: boolean; stored?: string | null; redisError?: Error } = {},
) {
  const config = {
    get: vi.fn(() => options.ttl ?? 3_600),
  } as unknown as ConfigService<Env, true>;
  const get = options.redisError
    ? vi.fn(async (): Promise<string | null> => {
        throw options.redisError;
      })
    : vi.fn(async () => options.stored ?? null);
  const set = options.redisError
    ? vi.fn(async (): Promise<'OK'> => {
        throw options.redisError;
      })
    : vi.fn(async () => 'OK' as const);
  const redis = { isUp: options.redisUp ?? true, get, set } as unknown as RedisProvider;

  return { service: new AskCacheService(config, redis), get, set };
}

const keyParts = {
  serverId: SERVER_ID,
  channelId: CHANNEL_ID,
  messageIds: [MESSAGE_A, MESSAGE_B],
  model: 'openai/gpt-oss-20b',
  question: 'Kế hoạch release là gì?',
};

describe('AskCacheService', () => {
  describe('buildKey', () => {
    it('ổn định khi thứ tự id tin thay đổi', () => {
      const { service } = setup();

      const first = service.buildKey(keyParts);
      const second = service.buildKey({ ...keyParts, messageIds: [MESSAGE_B, MESSAGE_A] });

      expect(first).toBe(second);
      expect(first).toMatch(/^ai:ask:[0-9a-f]{64}$/);
    });

    it('không chứa câu hỏi hay id tin dạng thô (tránh lộ nội dung trong Redis)', () => {
      const { service } = setup();

      const key = service.buildKey(keyParts);

      expect(key).not.toContain(MESSAGE_A);
      expect(key).not.toContain('release');
    });

    it('khác nhau theo server, channel, model, khoảng tin và câu hỏi', () => {
      const { service } = setup();
      const base = service.buildKey(keyParts);

      const variants = [
        service.buildKey({ ...keyParts, serverId: '44444444-4444-4444-8444-444444444444' }),
        service.buildKey({ ...keyParts, channelId: undefined }),
        service.buildKey({ ...keyParts, model: 'other-model' }),
        service.buildKey({ ...keyParts, messageIds: [MESSAGE_A] }),
        service.buildKey({ ...keyParts, question: 'Câu hỏi khác?' }),
      ];

      for (const variant of variants) expect(variant).not.toBe(base);
      expect(new Set(variants).size).toBe(variants.length);
    });

    it('chuẩn hoá khoảng trắng và hoa/thường của câu hỏi', () => {
      const { service } = setup();

      const first = service.buildKey({ ...keyParts, question: '  Kế hoạch   RELEASE là gì? ' });
      const second = service.buildKey({ ...keyParts, question: 'kế hoạch release là gì?' });

      expect(first).toBe(second);
    });
  });

  describe('get', () => {
    it('đọc và kiểm tra payload hợp lệ', async () => {
      const { service, get } = setup({ stored: JSON.stringify(answer) });

      await expect(service.get('ai:ask:x')).resolves.toEqual(answer);
      expect(get).toHaveBeenCalledWith('ai:ask:x');
    });

    it('trả null khi tắt cache (TTL = 0), không gọi Redis', async () => {
      const { service, get } = setup({ ttl: 0, stored: JSON.stringify(answer) });

      await expect(service.get('ai:ask:x')).resolves.toBeNull();
      expect(get).not.toHaveBeenCalled();
    });

    it('trả null khi Redis chết (fail-open)', async () => {
      const { service, get } = setup({ redisUp: false, stored: JSON.stringify(answer) });

      await expect(service.get('ai:ask:x')).resolves.toBeNull();
      expect(get).not.toHaveBeenCalled();
    });

    it('trả null khi Redis lỗi', async () => {
      const { service } = setup({ redisError: new Error('ECONNRESET') });

      await expect(service.get('ai:ask:x')).resolves.toBeNull();
    });

    it.each([
      ['JSON hỏng', '{not json'],
      ['thiếu answer', JSON.stringify({ citations: [MESSAGE_A], model: 'fake' })],
      ['thiếu model', JSON.stringify({ answer: 'x', citations: [MESSAGE_A] })],
      ['citations rỗng', JSON.stringify({ answer: 'x', citations: [], model: 'fake' })],
      ['citations sai kiểu', JSON.stringify({ answer: 'x', citations: [1], model: 'fake' })],
      ['không phải object', JSON.stringify('x')],
    ])('trả null với payload %s', async (_label, stored) => {
      const { service } = setup({ stored });

      await expect(service.get('ai:ask:x')).resolves.toBeNull();
    });
  });

  describe('set', () => {
    it('ghi JSON với TTL cấu hình', async () => {
      const { service, set } = setup({ ttl: 120 });

      await service.set('ai:ask:x', answer);

      expect(set).toHaveBeenCalledWith('ai:ask:x', JSON.stringify(answer), 'EX', 120);
    });

    it('không ghi khi tắt cache hoặc Redis chết', async () => {
      const disabled = setup({ ttl: 0 });
      const down = setup({ redisUp: false });

      await disabled.service.set('ai:ask:x', answer);
      await down.service.set('ai:ask:x', answer);

      expect(disabled.set).not.toHaveBeenCalled();
      expect(down.set).not.toHaveBeenCalled();
    });

    it('nuốt lỗi Redis: cache là tối ưu, không làm hỏng câu trả lời', async () => {
      const { service } = setup({ redisError: new Error('ECONNRESET') });

      await expect(service.set('ai:ask:x', answer)).resolves.toBeUndefined();
    });
  });
});
